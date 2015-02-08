var fs = require("fs");
var _path = require("path");
var HB=require("handlebars");
var _=require("lodash");

/**
 * This module is for managing site-wide component type definitions, typically stored as source code in [appRoot]/components/
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

/**
 * Creates a component type registry, which reads component definitions from files (view, model, dialog, etc) in a specified location
 * @returns {module:component-types~ComponentTypeRegistry} 
 * @param {Object} options - Configuration options
 * @param {String|Array} options.componentPaths - Path(s) where component type definitions will be stored
 */
exports.createRegistry = function(options){
	var cache = {};
	var ex={};
	var error;

	if(!options.componentPaths){
		error="'componentPaths' must be specified when creating componentTypes registry";
		console.log(error);
		throw(new Error(error));
	}
	var componentTypeRoot=_.isArray(options.componentPaths)?options.componentPaths[0]:options.componentPaths;

	if(!fs.existsSync(componentTypeRoot)){
		error = "Specified component type file root does not exist: " + componentTypeRoot;
		consle.log(error);
		throw(new Error(error));
	}


	/////////////////////////////////////////////////////////////////////////////////////////////
	function ComponentType(partialPath){
		if(!partialPath) return {error: "Bad partial path"};

		var typeName=_path.basename(partialPath);
		this.path = _path.join(componentTypeRoot, partialPath);

		this.render=function(model){
			if(this.template){
				return this.template(model);
			}else{
				//return "<div><pre>" + partialPath + "\n" + JSON.stringify(model,null,"  ") + "</pre></div>";
				return defaultTemplate(model, ex);
			}
		}


		if(!fs.existsSync(this.path)){
			this.error="Component type path not found: " + this.path;
			return;
		};


		var modelPath = _path.join(this.path, typeName + ".js");

		/// Load model configuration and processor.
		/// TODO: Warn if marked as async, but no match on string ".resolve("
		if(fs.existsSync(modelPath))
			try{
				this.model = require(modelPath);
			}catch(err){
				console.log("Problem loading model script: " + modelPath);
				throw(err);
			}

		
		// Load and compile template
		//TODO: look for more template types, maybe based on a template engine registry
		templatePath = _path.join(this.path, typeName + ".hbs");
		try{
			this.templateSource = fs.readFileSync(templatePath, "utf8");
			this.template = HB.compile(this.templateSource);
		}
		catch(err){
			console.log("Problem reading or compiling template: " + templatePath);
			throw(err);
		}
		
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
	 * @param {string} model._sling_resourceType - Required field specifying a valid type which will be taken from the component type registry.  Resource name is a path corresponding with folders found at (componentPaths[])
	 */
	 // TODO: Error handling.   Model with reference loop?
	ex.render = function(model){
		if(model && model._sling_resourceType){
			var componentType = ex.get(model._sling_resourceType)
			return componentType.render(model);
		}else{
			console.log("ex.render: Error rendering component type: " + componentType);
			throw(new Error("Model has no _sling_resourceType: " + JSON.stringify(model) ));
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

		if(cache[path]){
			return cache[path];
		}else{
			var componentType = new ComponentType(path);
			if(componentType){
				cache[path]=componentType;
			}
			return componentType;
		}
	}


	/////////////////////////////////////////////////////////////////////////////////////////////
	/// TODO: need to better validate types of parameters (model, resourceType and option), since they are completely variadic.
	/// TODO: If object, assume it is the model.  If string, assume it is resourceType.  If resource type is first, and no object, then it is just a direct "script" include
	HB.registerHelper("component", function(model, resourceType, options){
		if(model){		
			var type=model._sling_resourceType;
			if(type){
				var cmp=ex.get(type);
				if(cmp.render)			
					return cmp.render(model);
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
	var colors=["ddd","#cce","ecc","cec"];
	var currentColor=0; 

	return(componentHtml(model));

	/////////////////////////////////////////////////////////////////////
	function componentHtml(model){
		var html = [];
		var meta=[], normal=[], components=[];
		var color = colors[(currentColor++)%colors.length];

		html.push("<div style='background-color:" + color + "; padding:0px; overflow: scroll;'><span style='font-family:monospace;  background-color:#ee6; border:1px solid black;'>" + model._sling_resourceType + "</span><table cellspacing='0'>\n");

		_.forEach(model, function(val,key){
			if(key[0]=='_')
				meta.push(key);
			else if(val["_sling_resourceType"])
				components.push(key);
			else
				normal.push(key);
		});

		_.forEach([normal, components, meta], function(keyset, index){
			_.forEach(keyset, function(key){				
				html.push("\n<tr><td style='border:1px solid black;' valign='top'><span style='font-family:monospace; font-weight:bold'>" + key + "&nbsp;</span></td><td style='border:1px solid black;'>");
				
				if(index==1){
					var componentType=model[key]._sling_resourceType;
					var cmp=registry.get(componentType);
					if(cmp.template){
						try{
							html.push(cmp.template(model[key]));
						}catch(err){
							console.log("Problem rendering: "+ componentType, err);
							throw(err);
						}
					}else	
						html.push(componentHtml(model[key]));
				}else{
					html.push("<pre>" + JSON.stringify(model[key], null, "  ") + "</pre>");
				}

				html.push("</td></tr>");
			})
		});

		html.push("</table></div>");
		return html.join("");
	}

}




/**
 * Not an actual class, but instead a closure which is returned by [component-types.createRegistry]{@link module:component-types.createRegistry}
 * @class module:component-types~ComponentTypeRegistry
 * 
 **/


