var fs = require("fs");
var _path = require("path");
var HB=require("handlebars");
var _=require("lodash");
var jsontoxml = require("jsontoxml");
var watch=require("watch");

/**
 * This module is for managing site-wide component type definitions, typically stored as source code in [appRoot]/components/
 * The separation of concerns for this module is a bit spotty, with template rendering functions and what not.
 * @module component-types
 */

/// TODO: Error handling all through this module is mostly bad and wrong. \
/// TODO: Error handling: HBS template has a syntax error, it is badly handled.
///	TODO: Error handling: "Component path not found" ... is it even an error condition?  Just log it.  
/// TODO: You need a proper logger mechanism for this module, and for the whole framework
/// TODO: error handling needs review:  ex.render()  ... throw?
/// TODO: error handling is not good:  HB.registerHelper(include) 

/// TODO: Plug in different template engines.
/// TODO: Should the template engine reference really live in this component-types module?  Should "render" be a separate mod?

/// TODO: Add option to pre-load all component type definitions, rather than lazy-loading.

/// TODO: Re-implement AEM component inheritence model: templates, models, etc. And mechanisms to include parents at runtime.  sling:resourceSuperType
/// TODO: Implement a direct relative-path template include mechanism, independent of "component" helper
/// TODO: Re-implement clientlibs mechanism, then make a better one.
/// TODO: Handlebars iterator helper, to replace built-in "each," which ignores all meta data fields.

/**
 * Creates a component type registry, which reads component definitions from files (view, model, dialog, etc) in a specified location
 * @returns {module:component-types~ComponentTypeRegistry} 
 * @param {Object} options - Configuration options
 * @param {String|Array} options.componentPaths - Path(s) where component type definitions will be stored
 * @param {boolean} options.componentCacheDisable - Disable registry cache.  This option is useful in development, but should never be used in production.
 * @param {boolean} options.componentCacheClearOnChange - Watch componentPaths for changes, and clear registry cache if so
 */
exports.createRegistry = function(options){
	var cache = {};
	var ex={};
	var error;
	var lastWatchEvent=new Date();

	if(!options.componentPaths){
		error="'componentPaths' must be specified when creating componentTypes registry";
		throw new Error(error);
	}
	var componentTypeRoot=_.isArray(options.componentPaths)?options.componentPaths[0]:options.componentPaths;

	if(!fs.existsSync(componentTypeRoot)){
		error = "Specified component type file root does not exist: " + componentTypeRoot;
		throw new Error(error);
	}

	if(!options.componentCacheDisable && options.componentCacheClearOnChange){
		console.log("Watching: " + componentTypeRoot);
		watch.watchTree(componentTypeRoot, function(f){
			var now = new Date();
			if((now-lastWatchEvent)>1000){
				console.log("Changed component src: ", f)
				_.each(cache, function(val, key){
					delete cache[key];
				});
				console.log("Cleared component cache");		
			}
		});
	}

	/////////////////////////////////////////////////////////////////////////////////////////////
	function ComponentType(partialPath){
		if(!partialPath) return {error: "Bad partial path"};
		var typeName=_path.basename(partialPath);
		var componentPath=this.path=_path.join(componentTypeRoot, partialPath);

		/////////////////////////////////////////////////////////////////////////////////
		// TODO: Catch errors here?
		this.render=function(model, selectors, extension, httpMethod){
			var tmpl = exports.findBestTemplateMatch(templateFiles, typeName, selectors, extension, httpMethod);
			if(tmpl && tmpl.name && this.templates[tmpl.name] && this.templates[tmpl.name].fn){
				return this.templates[tmpl.name].fn(model);
			}else{

				// TODO: Blacklight-level config to turn off the default template
				try{					
					if(extension=="json" || extension == "xml"){
						if(_.contains(selectors, "meta")){
							exports.setMetaEnumeration(model, true, !_.contains(selectors, "all"));
						}
						if(extension=="json")
							return JSON.stringify(model);						
						else
							return "<data>" + jsontoxml(model) + "</data>";					
					}else
						return defaultTemplate(model, ex);
				}catch(err){
					throw(err)
				}
			}
		}


		if(!fs.existsSync(componentPath)){
			this.error="Component type path not found: " + componentPath;
			return;
		};


		var modelPath = _path.join(componentPath, typeName + ".js");

		/// Load model configuration and processor.
		/// TODO: Warn if marked as async, but no match on string ".resolve("
		if(fs.existsSync(modelPath))
			try{
				this.model = require(modelPath);
				this.model.path = modelPath;
			}catch(err){
				throw {message:"Error while loading component model processing script",
						path: modelPath,
						error: err,
						stack: err.stack};
			}

	


		/////////////////////////////////////////////////////////////////////////////////
		// Load and compile template
		// TODO: look for more template types other than HBS, maybe based on a "template engine" registry
		var templateFiles = [];
		try{
			_.each(fs.readdirSync(componentPath), function(name,key){
				if(name.substr(-4)===".hbs"){
					templateFiles.push(name);
				}
			});
			templateFiles = parseFilenames(templateFiles, typeName);
		}catch(err){
			this.error=err.message;
			this.errorStack=err.stack;
			return;
		}

		var templates = this.templates = {};
		_.each(templateFiles,function(file,key){
			var templatePath=_path.join(componentPath, file.name);
			try{
				var templateSource = fs.readFileSync(templatePath, "utf8");
				var fn = HB.compile(templateSource);

				templates[file.name]={path: templatePath, src: templateSource, fn: fn};
			}
			catch(err){
				throw {messge: "Problem reading or compiling template script",
						path: templatePath,
						error: err,
						stack: err.stack};
			}
		});

	}

	 // TODO: ex.Render, Add selector capability to choose different templates (.mobile, etc)

	/////////////////////////////////////////////////////////////////////////////////////////////
	/**
	 * Render the provided model by finding its resourceType in the registry and applying the associated template
	 * 
	 * @function render
	 * @memberof module:component-types~ComponentTypeRegistry
	 * @instance
	 *
	 * @param {Object} model - The model data to apply associated template against.  
	 * @param {string} model._meta._sling_resourceType - Required field specifying a valid type which will be taken from the component type registry.  Resource name is a path corresponding with folders found at (componentPaths[])
	 */
	 // TODO: Error handling.   Model with reference loop?
	ex.render = function(model, selectors, extension, httpMethod){
		var rtype = getResourceType(model);			

		if(rtype){
			var componentType = ex.get(rtype);
			return componentType.render(model, selectors, extension, httpMethod);
		}else{
			console.log("ex.render: Model has no _meta._sling_resourceType: " + JSON.stringify(model) );
		}
	}

	/////////////////////////////////////////////////////////////////////////////////////////////
	/**
	 * Get component type from registry
	 * 
	 * @function get
	 * @memberof module:component-types~ComponentTypeRegistry
	 * @instance
	 *
	 * @param {String} path - Component type name, ie. the "sling:resourceType" value
	 */	/////////////////////////////////////////////////////////////////////////////////////////////
	ex.get=function(path){

		if(!options.componentCacheDisable && cache[path]){
			return cache[path];
		}else{
			var componentType = new ComponentType(path);

			if(!options.componentCacheDisable && componentType){
				cache[path]=componentType;
			}
			return componentType;
		}
	}


	/////////////////////////////////////////////////////////////////////////////////////////////
	/// TODO: need to better validate types of parameters (model, resourceType and option), since they are completely variadic.
	/// TODO: If object, assume it is the model.  If string, assume it is resourceType.  If resource type is first, and no object, then it is just a direct "script" include
	HB.registerHelper("component", function(model, resourceType, options){
		if(_.isString(model)){
			// TODO: only a string has been specified in args, so treat it as a relative path
		}


		if(model){
			var type=getResourceType(model);
			 
			if(_.isString(resourceType)){  // if "component" helper was called with a specified "resourceType" 
				if(resourceType=="raw"){
					return defaultTemplate(model, ex);  // special "virtual" resource type of "raw" 
				}else{
					type=resourceType;  // otherwise specified resource type overrides model's type
				}
			}

			if(type){
				var componentType=ex.get(type);
				if(componentType.render)			
					return componentType.render(model);
				else
					return "No render function for: " + type;
			}else{
				return "<pre>Error: no _sling_resourceType found in included component</pre>"
			}
		}
	})


	return ex;

}


//Todo: turn default template's component renderer into a Handlebars helper, so developers can make use of it.

///////////////////////////////////////////////////////////////////
function defaultTemplate(model, registry) {
	var colors=[ "#CCD4EE","#CCD5E0","#D8DAEA","#D5E4F4", "#f1f1f1"];
	var nonComponentColors=["#EEB4B4","#ECC3BF", "#FFCCCC"];
	var currentColor=colors.length-1; 
	var currentNonComponentColor=0;

	return(componentHtml(model));

	/////////////////////////////////////////////////////////////////////
	function componentHtml(model){
		var html = [];
		var meta=[], normal=[], components=[];
		var color = colors[currentColor];
		currentColor = (currentColor+1)%(colors.length-1);

		if(!model) return "";

		html.push("\n\n<!-- component --><div style='background-color:" + color + "; padding:0px; overflow: scroll;'><span style='font-family:monospace;  background-color:#ee6; border:1px solid black;'>" + getResourceType(model) + "</span><table cellspacing='0'>\n");

		_.forEach(model, function(val,key){
			if(key[0]=='_')
				meta.push(key);
			else if(getResourceType(val))
				components.push(key);
			else
				normal.push(key);
		});

		_.forEach([normal, components, meta], function(keyset, index){
			_.forEach(keyset, function(key){				
				html.push("\n<tr><td style='border:1px solid black;' valign='top'><span style='font-family:monospace; font-weight:bold'>" + key + "&nbsp;</span></td><td style='border:1px solid black;'>");
				
				if(index==1){
					var componentType=getResourceType(model[key]);
					var cmp=registry.get(componentType);
					if(cmp.template){
						try{
							html.push(cmp.template(model[key]));
						}catch(err){
							throw {message: "Problem rendering component: " + componentType,
									error: err,
									stack: err.stack};
									
						}
					}else	
						html.push(componentHtml(model[key]));
				}else{
					/// TODO: If it is an object, recurse on fields so they appear in a table. 
					html.push(nonComponentHtml(model[key]));
				}

				html.push("</td></tr>");
			})
		});

		html.push("</table></div><!-- end component -->\n\n");
		return html.join("");
	}

	function nonComponentHtml(nonComponentData){
		var html=[];
		var color = nonComponentColors[(currentNonComponentColor++)%nonComponentColors.length];


		if(!_.isArray(nonComponentData) && !_.isString(nonComponentData) && !_.isNumber(nonComponentData)){
			html.push("\n\n\n<div style='background-color:" + color + "; padding:0px; overflow: scroll;'><table cellspacing='0'>\n");
			_.forEach(nonComponentData,function(item,key){
				html.push("<tr><td style='border:1px solid black; font-family:monospace; font-weight:bold' valign='top'>" + key + "&nbsp;</td><td style='border:1px solid black;'>");
				if(getResourceType(item))
					html.push(componentHtml(item));
				else
					html.push(nonComponentHtml(item));
				html.push("</td></tr>");
			} );
			html.push("</table></div>\n\n");
		}else{
			html.push("<span style='font-family:monospace;'>" + JSON.stringify(nonComponentData) + "</span>");
		}

		return html.join("");

	}

}


	

///////////////////////////////////////////////////////////////
/**
 * Given list of file paths, and request parameters, find best match for rendering. 
 * @param {string[]|files[]} filenames
 * @param {string[]} selectors - selectors in the request path
 * @param {string} extension - extension on the request path 
 * @param {string} httpMethod - http method of request
 * @parivate.
 */
exports.findBestTemplateMatch=function(files, requiredBasename, requestSelectors, requestExtension, httpMethod){
	if(!files || !files[0]) return null;
	
	if(_.isString(files[0])){
		files = parseFilenames(files, requiredBasename);
	}

	var candidateFiles = files.slice();
	httpMethod=httpMethod||"GET";
	var methodIsGetOrHead = httpMethod.match(/^(GET|HEAD)$/);
	requestExtension = requestExtension||"html";


	///TODO: Both method and extension lookups need to fail to resolve, if there is not match.
	// 		  Failure to resolve needs to be passed back to "defaultHandler", whatever that may be.

	if(httpMethod){
		if(methodIsGetOrHead){
			var candidateFiles = _.filter(candidateFiles, function(file){
				var foundRejectableSelector=false;
				_.each(file.selectors, function(selector){
					if ((selector != httpMethod) && selector.match("^[A-Z]*$"))
						foundRejectableSelector=true;
				});
				if(foundRejectableSelector) return false 
				else return true;
			});			
		}else{
			var candidateFiles = _.filter(candidateFiles, function(file){
				return _.indexOf(file.selectors, httpMethod)>-1;
			});			
		}
	}


	/// TODO:  what about "request/file.txt.bar.html" ... wouldn't .txt always win, if present?
 	if(requestExtension!="html"){
		candidateFiles = _.filter(candidateFiles, function(file){
			return _.contains(file.selectors, requestExtension);
		});		
	}


	_.each(requestSelectors,function(currentRequestSelector,key){
		candidateFiles = whittleBySelector(candidateFiles, currentRequestSelector);
	})

	var bestFile=candidateFiles[0];
	_.each(candidateFiles,function(file){
		if(file.selectors.length<bestFile.selectors.length)
			bestFile = file;
	})

	return bestFile;	
};


///////////////////////////////////////////////////////////////
function whittleBySelector(files, selector){
	var workingFiles = _.filter(files, function(file){
		return _.contains(file.selectors, selector);
	});
	if(workingFiles.length>0)
		return workingFiles;
	else
		return files;
}

///////////////////////////////////////////////////////////////
function parseFilenames(filenames, requiredBasename){
	var files=[];
	var file;
	_.each(filenames,function(filename){
		file = parseFilename(filename);
		if(file.base==requiredBasename){
			files.push(file);
		}
	})
	return files;
}


///////////////////////////////////////////////////////////////
function parseFilename(filename){
	var parts = filename.split(".");

	return {
		name: filename,
		base: parts.shift(),
		extension: parts.pop(),
		selectors: parts
	};

}


///////////////////////////////////////////////////////////////
/**
 * Helper to find resource type, without fear of throwing undefined property exceptions
 * @param {Model} model - an object, that is possibly a model with meta data.
 */
function getResourceType(model){
	if(model && model._meta && model._meta._sling_resourceType)
		return model._meta._sling_resourceType;
	else
		return null;
}


exports.setMetaEnumeration = function(object, makeEnumerable, keepOnlyResourceType){
	if(object._meta){
		if(keepOnlyResourceType){
			var rtype=object._meta._sling_resourceType;
			if(rtype){
				object._meta={};
				object._meta._sling_resourceType=rtype;
			}else{
				delete object._meta
			}
		}

		if(object._meta)
			Object.defineProperty(object, "_meta", {
				enumerable: makeEnumerable
			});			
	}

	for(var key in object){
		if(object[key].hasOwnProperty("_meta")){
			exports.setMetaEnumeration(object[key], makeEnumerable, keepOnlyResourceType);
		}
	}
}




/**
 * Not an actual class, but instead a closure which is returned by [component-types.createRegistry]{@link module:component-types.createRegistry}
 * @class module:component-types~ComponentTypeRegistry
 * 
 **/


