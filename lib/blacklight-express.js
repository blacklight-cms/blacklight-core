
var _path = require("path");
var models = require("./models");
var mime = require('mime-types');
var componentTypes = require("./component-types");
var _=require("lodash");
var favicon = require("serve-favicon")(__dirname + "/../assets/favicon/favicon.ico");
var htmlEscape = require("html-escape");

/**
 * @module blacklight-express
 *
 */


/// TODO: mechanism to pass provided SlingConnector through to the model processor's "utility" object.
/// TODO: Error handling: wrap everything in a big try/catch?
/// TODO: Detect recursion loop: compare current object against global lookup stack of already-touched.  Also, hard limit depth?
/// TODO: NEed much better error handling, plus much better debugging options
/**
 * Create a Blacklight middleware for Express, pointing to a single Sling endpoint and its own component-type resolution path
 *
 * @param {Object} options - configuration options
 * @param {String|Array} options.componentPaths - Path(s) where component type definitions will be stored
 * @param {Boolean} [options.watchComponentTypes=false] - Watch for changes to component source code and reload
 * @param {Object} options.slingConnectors - A dictionary of fully configured SlingConnectors, organized by runMode and port; use blacklight.connectionsByRunMode to generate
 * @param {Object} options.utilities - 'utilities' to be made available to all model processors (slingConnector, express.req and others will be added automatically)
 * @param {Object} options.language - language options
 * @param {error-mailer} [options.emailError] - Blacklight error-mailer method  
 * @param {Object[]} options.language.allowed - Array of allowed language targets.  Each object holds `path`, `name`, and `iso`
 * @param {String} options.language.default - path name of the `default` language.  `path` id must exist in the array of `allowed` languages
 * @param {Function} options.translationMethod - optional function which takes a key name, and a handlebars helper options object, and returns a translated string
 * @param {String} [options.defaultAuthorMode=disabled] - By default, what mode should authoring tools be in, unless overridden by cookie or query string? Possible: `edit`, `preview`, `disabled`
 * @param {String} [options.skipModelProcessors] - Set to `true` to ignore all component model processors.  Used for `templateOnlyMode`
  */


module.exports = function(options){
	var slingConnectors = options.slingConnectors;
	var emailError = options.emailError;
	processLanguageOptions(options);
	var slingPreProcessors=[], slingRedirects=[], proxies=[];

	var registry = componentTypes.createRegistry({
		componentPaths: options.componentPaths, 
		componentCacheDisable:options.componentCacheDisable,  
		componentCacheClearOnChange: options.componentCacheClearOnChange, 
		postProcess: options.postProcess, 
		postProcessOptions: options.postProcessOptions,
		publicRoot: options.publicRoot,
		emailError: emailError,
		translationMethod: options.translationMethod
	});
	var self=this;

	if(options.requestPreprocessors){
		this.requestPreprocessors= _.isArray(options.requestPreprocessors) ? options.requestPreprocessors : [options.requestPreprocessors];

		_.each(this.requestPreprocessors, function(rp){
			if(!rp.path && !rp.type){throw new Error("No 'path' or 'type' specifier found in requestPreprocessor:" + JSON.stringify(rp));}
			if(_.isString(rp.path)) rp.path = new RegExp(rp.path);
			if(_.isString(rp.type)) rp.type = new RegExp(rp.type);
			rp.redirect && slingRedirects.push(rp);
			rp.slingPreprocess && slingPreProcessors.push(rp);
			rp.proxy && proxies.push(rp);
		});
	}
	

	// Here is the actual middleware function
	return function(req, res, next){

		if(req.path==="/favicon.ico"){

			favicon(req, res, next);

		}else{			
			var path = req.path, i=0, found=false;
			var originalPath=path;

			while(!found && i<slingRedirects.length){
				var curRedirect=slingRedirects[i]
				if(found=curRedirect.path.test(path)){
					path = path.replace(curRedirect.path, curRedirect.redirect);
				}
				i++;
			}
			//if(found){console.log("BLACKLIGHT: Redirecting from ", req.path, " to ", path);}
			path=parsePath(path, options.language);
			path.originalPath=originalPath;

			req.selectors = path.selectors;
			var extension = path.extension;
			var supportedExtensions=["html","json","xml","raw"]
			//console.log("Blacklight retrieving from Sling: " + path.slingPath);

			var reqSc = slingConnectors.getByReq(req);
			var slingConnector = reqSc.slingConnector;
			var requestedMode = reqSc.requestedMode;

			
			if(extension && !_.includes(supportedExtensions, extension)){
				res.setHeader('Cache-Control', 'public, max-age=345600'); 
				var headers, ifmod=req.headers['if-modified-since'];
				if(ifmod){headers={'if-modified-since': ifmod}};
				var str=slingConnector.getStream(req.path, req.method, headers);
				str.on("error",function(err){
					res.set("Content-Type", "text/plain");
					res.status(500).end("Error proxying to sling resource");
				});
				str.pipe(res);

			}
			else{

				var foundProxy=false; var i=0;
				while(!foundProxy && i<proxies.length){
					if(proxies[i].path.test(path.originalPath)){
						foundProxy=true;
						proxies[i].proxy(path, {req:req}, function(err,slingData){
							if(err){
								err.slingPath = path.slingPath;
								err.slingConnectMessage = slingData;
								renderError(req, res, err, extension, "Sling PROXY error on request: " + path.slingPath);
							}
							processSling(slingData)
						})
					}else{
					  i++;
					}
				}

				if(!foundProxy)
					slingConnector.get(path.slingPath, "infinity", function(err, slingData){
						if(err){
							err.slingPath = path.slingPath;
							err.slingConnectMessage = slingData;
							renderError(req, res, err, extension, "Sling connection error on request:\n" + slingConnector.baseUri + path.slingPath);

						}else{
							processSling(slingData);
						}
						
					});



				//////////////////////////////////////////////////
				function processSling(slingData){
						var utilities=_.defaults({
								mode: requestedMode,
								page: makePageInfo(req, path, options),
								express: {req: req, res: res}, 
								makeBlankComponent: models.makeBlankComponent,
								sling: slingConnector,
								blacklight:{publicRoot: registry.publicRoot, emailError: registry.emailError, translate : options.translationMethod},
								isTopLevel:true
							}, 
							options.utilities);

						var found=false,i=0;
						var allCurSlingProcessors=[];


						while(i<slingPreProcessors.length){
							var curSlingProcessor=slingPreProcessors[i];
							if( ( curSlingProcessor.path && curSlingProcessor.path.test(path.originalPath) ) || ( curSlingProcessor.type && curSlingProcessor.type.test(slingData._sling_resourceType) ) ){
								allCurSlingProcessors.push(curSlingProcessor.slingPreprocess);
							}
							i++;
						}	


						var curTimeout;


						function donePreprocessing(err){
							clearTimeout(curTimeout);
							if(err){
								renderError(req, res, err, extension, "Error preprocessing data model");
							}else{
								if(allCurSlingProcessors.length){
									preProcessSling();
								}else{
									generateModel();
								}
							}
						}

						function preProcessSling(){
							curTimeout=setTimeout(function(){
								renderError(req, res, new Error("Sling preprocessor timeout: " + curSlingProcessor.toString()), extension, "User-supplied Sling post-processor did not callback within timeout of 60 seconds");
							},45000);

							curSlingProcessor=allCurSlingProcessors.shift();
							try{
								curSlingProcessor(slingData, utilities, donePreprocessing);
							}catch(err){
								renderError(req, res, err, extension, "Error in user-supplied Sling post-processor");
							}
						}

						if(allCurSlingProcessors.length){
							preProcessSling();
						}else{
							generateModel();
						}

						////////////////////////////////////////////////////////////////////////
						function generateModel(){

							models.generateModelFromRaw(slingData, registry, utilities, options.skipModelProcessors)
								.then(function(model){
									renderModelWithTemplate(model);
								}, function(err){
									renderError(req, res, err, extension, "Error generating data model");
									throw(err);
								}).catch(function(error){
									renderError(req, res, error, extension, "Unhandled exception (possibly an error in framework code?)");
									throw(error);
								});					
						}


						////////////////////////////////////////////////////////////////////////
						function renderModelWithTemplate(model){
							try{
								//res.json(model);
								var defaultContentType = mime.contentType(path.extension || "html");
								var body = registry.render(model.data, {data:{root:model.data, contextPath:"."}, topLevel:true}, path.selectors, path.extension, req.method);
								if(!res.headersSent){
									if(defaultContentType) res.set("Content-Type", defaultContentType);
									res.send(body);
								}
							}catch(err){
								renderError(req, res, err, extension, "Error rendering template");
							}
						}


				}
			}
		}
	};


	//////////////////////////////////////////////////////////////////////////////////////
	function renderError(req, res, err, extension, context){
		console.error("\n------> " + context, "\n", err, "\n", err.stack);
		extension = extension || "html";
		context = context || "Error rendering page";

		emailError && emailError({subject: "Blacklight 500 error", text: err, req: req});

		if(extension=="html"){
			err.message=htmlEscape(err.message);
			var stack=htmlEscape(err.stack);
			res.status(500).send("<div style='color:#911; font-family:sans-serif'><h1>" + context + "</h1><h3>" + err.message + "</h3></div><hr><pre>" + JSON.stringify(err,null,"  ") + "<hr>" + stack + "</pre>")
		}else{
			res.status(500).json({message: context, error: err, stack: err.stack});
		}
	}


}


	
module.exports.parsePath=parsePath;

//////////////////////////////////////////////////////////////////////////////////////
function parsePath(path, languageOptions){
	var parts = path.slice(1).split("/");
	var language;

	languageOptions = languageOptions || {};

	if(languageOptions.allowedPaths){
		_.forEachRight(parts,function(val){
			if((val.length<5) && _.includes(languageOptions.allowedPaths, val)){
				language=val;
				return false;
			}
		});
	}

	language = language || languageOptions.default || "en";

	var lastPart = parts.pop();
	var selectors = lastPart.split(".");
	var name = selectors.shift();
	var ext = selectors.pop() || "";

	if(name=="index" || !name){
		name=(parts.length>0)?parts.pop():"";
	}

	var trimmedPath = (parts.length?"/":"") + parts.join("/") + (name?"/":"") + name; 
	var slingPath = trimmedPath + "/_jcr_content";

	return {slingPath: slingPath, trimmedPath: trimmedPath,  selectors: selectors, extension: ext, language: language}
}

//////////////////////////////////////////////////////////////////////////////////////
function makePageInfo(req, path, blConfig){
	var info = _.clone(path);
	info.languages = _.clone(blConfig.language);

	var mode = req.query.author_mode || req.query.wcmmode	|| blConfig.defaultAuthorMode || "disabled";
	info.authorMode = mode.toLowerCase();
	
	if(req.query.debug)
		info.debug = req.query.debug.split(",");
	else
		info.debug=[];

	return info;
}


//////////////////////////////////////////////////////////////////////////////////////
function processLanguageOptions(options){
	if(!options.language){options.language={};}
	if(!options.language.default){options.language.default="en"};
	var defaultLang=options.language.default;
	if(!options.language.allowed){options.language.allowed=[{path:defaultLang, name: defaultLang, iso: defaultLang}]};
	options.language.allowedPaths = _.map(options.language.allowed,"path");
	
	options.language.lookup=function(path){
		return _.find(this.allowedPaths, function(lang){return lang.path===path});
	}
}



/*
	Important test cases:

	/content/en/index.mobile.html
	/content/en.mobile.html
	/content/index.mobile.html
	/content.mobile.html
	/index.mobile.html
	/

*/





