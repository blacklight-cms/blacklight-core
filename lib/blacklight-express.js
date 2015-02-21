
var _path = require("path");
var models = require("./models");
var mime = require('mime-types');
var componentTypes = require("./component-types");
var _=require("lodash");
var favicon = require("serve-favicon")(__dirname + "/../assets/favicon/favicon.ico");

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
 * @param {SlingConnector} options.slingConnector - A fully configured SlingConnector
 * @param {Object} options.utilities - 'utilties' to be made available to all model processors (slingConnector, express.req and others will be added automatically)
 */


module.exports = function(options){
	var slingConnector = options.slingConnector;

	var registry = componentTypes.createRegistry({componentPaths: options.componentPaths, componentCacheDisable:options.componentCacheDisable,  componentCacheClearOnChange: options.componentCacheClearOnChange});

	// Here is the actual middleware function
	return function(req, res, next){

		favicon(req, res, function onNext(){
			var path=parsePath(req.path);
			req.selectors = path.selectors;
			var extension = path.extension;
			req.trimmedPath = path.trimmedPath;
			//console.log("Blacklight retrieving from Sling: " + path.slingPath);

			slingConnector.get(path.slingPath,"infinity",function(err, slingData, slingResponseObject){
				if(err){
					err.slingPath = path.slingPath;
					err.slingConnectMessage = slingData;
					renderError(res, err, extension, "Sling connection error");

				}else{
					var utilties=_.defaults({express: {req: req, res: res}, sling: slingConnector}, options.utilities);

					models.generateModelFromRaw(slingData, registry, utilties)
						.then(function(model){
							try{
								//res.json(model);
								var defaultContentType = mime.contentType(path.extension || "html");
								var body = registry.render(model.data, path.selectors, path.extension, req.method);
								if(defaultContentType) res.set("Content-Type", defaultContentType);
								res.send(body);
							}catch(err){
								renderError(res, err, extension, "Error rendering template");
							}
						}, function(err){							
							renderError(res, err, extension, "Error generating data model");
							throw(err);
						}).catch(function(error){
							renderError(res, error, extension, "Unhandled exception (possibly an error in frameowrk code?)")
							throw(error);
						});
				}
				
			});

		} );
		

		}
}


//////////////////////////////////////////////////////////////////////////////////////
function renderError(res, err, extension, context){
	console.error(res,err,err.stack, extension,context);
	extension = extension || "html";
	context = context || "Error rendering page";
	if(extension=="html"){
		res.status(500).send("<div style='color:#911; font-family:sans-serif'><h1>" + context + "</h1><h3>" + err.message + "</h3></div><hr><pre>" + JSON.stringify(err,null,"  ") + "<hr>" + err.stack + "</pre>")
	}else{
		res.status(500).json({message: context, error: err, stack: err.stack});
	}
}

//////////////////////////////////////////////////////////////////////////////////////
function parsePath(path){
	var parts = path.slice(1).split("/");
	var lastPart = parts.pop();
	var selectors = lastPart.split(".");
	var name = selectors.shift();
	var ext = selectors.pop() || "";

	if(name=="index" || !name){
		name=(parts.length>0)?parts.pop():"";
	}

	var trimmedPath = (parts.length?"/":"") + parts.join("/") + (name?"/":"") + name; 
	var slingPath = trimmedPath + "/_jcr_content";

	return {original: path, slingPath: slingPath, selectors: selectors, extension: ext, trimmedPath: trimmedPath}
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





