/////////////////////////////////////////////////////////////////////////////////
var _ = require("lodash");
var ctypes = require("./component-types");

require("es6-promise").polyfill();

var metaRegex=/^(jcr|cq|sling|fsc|fsl|fsr):/g ;
var keepRegex=/^(jcr|cq|sling)$/ ;


/**
 * This module is for managing models, which represent the raw data that drives a rendered page.  Pages are rendered by pushing these models through a template.  The template that is used is determined by the model's _sling_resourceType.
 * @module models
 */


/////////////////////////////////////////////////////////////////////////////////
/**
 * Given raw content resulting from a sling request, process the content into finalized data models, applying any model processing directives specified in the component type registry.
 * @example
 * var models=require("models");
 * models.generateModelFromRaw(mySlingContent, myTypeRegistry)
 *   .then(function(model){
 *	      console.log("Here is my model: ", model);
 *	  });
 * @param {Object} rawSlingComponent - An object containing the unprocessed result of a sling query. Should have sling:resourceType as a top-level property.  
 * @param {ComponentTypeRegistry} typeRegistry - An instance of the component type registry.  Typically there will be one instance of this registry per app, which will be passed around to modules which require its use.
 * @returns {Promise} A promise which is thenable, and will fulfill with the completed data model.
 */
exports.generateModelFromRaw = function(slingPageContent, typeRegistry, externalUtilities){

	var lastPromise = Promise.resolve(); /// Initial (empty) promise, to chain subsequent promises to.
	var raw={data: slingPageContent};   /// TODO: validate slingPageContent is both a component and a page
	var result={};
	var internalUtilities={};

	rawToModel(raw,result);
	return lastPromise.then(function(){return result});

	/////////////////////////////////////////////////////////////////////////////////
	/// Recursively convert raw sling data to a similarly-strctured component model, 
	/// executing any (possibly asynchronous) model scripts from the component-type registry as we go.
	///
	/// TODO: Move any keys beginning with an _ to the beginning of the key list, rather than scattered throughout
	function rawToModel(content, target){
		var recurseToChildComponents = [];
		_.forEach(content,function(val,key){
			var targetKey = remapSlingKey(key);
			if(isComponent(val)){
				target[targetKey]=objectWithMeta();
				lastPromise = lastPromise.then(function(){return new Promise(processModel(val, target[targetKey]))} );
				recurseToChildComponents.push(function(){rawToModel(val, target[targetKey]);})
			}else{
				processNonComponent(val,target,targetKey);
			}
		});

		// Here, recursion is done as a post-processing step. This sequencing ensures that all component siblings on this level 
		// get queued up for model processing in front of all "next generation" (ie. one level down) components. 
		// The sequence is enforced to make sure processed ancestor model data will always be available to descendent models, before those descendents try to build themselves
		_.forEach(recurseToChildComponents, function(doChildren){
			doChildren();
		});
		
	};


	/////////////////////////////////////////////////////////////////////////////////
	function processNonComponent(content, target, targetKey){
		//content might be an object or a property, don't know yet.
		if(targetKey[0]=="_"){
			if(!target.hasOwnProperty("_meta")) {target._meta={}; console.log("Uh-oh. model.js~processNonComponent had to add _meta property");}
			target=target._meta;
		}

		if(!_.isObject(content) ||  _.isArray(content)){
			target[targetKey]=content;
		}
		else{
			target[targetKey]=objectWithMeta();
			if(isComponent(content)){
				rawToModel(content, target[targetKey]);
			}else{			
				_.forEach(content,function(val,key){
					processNonComponent(val, target[targetKey], remapSlingKey(key));
				});	
			}
		}

	}

	///////////////////////////////////////////////////////////////
	/**
	  * Helper utility to process raw(ish) sling data into models
	  */
	 function processSlingUtility(slingContent){
		/// TODO: delete all this code and make something useful to process new sling
		var promise=exports.generateModelFromRaw(slingContent, typeRegistry, externalUtilities);

		promise.then(function(newContent){
			///what now?
		});

		return promise;
	}



	/////////////////////////////////////////////////////////////////////////////////
	/// TODO: grab body for this loop from the text of "model.js" as stored in the component types registry
	/// TODO: DEFINITELY include a model-config.json ...  should have cascading inheritence from parent folders.  Result stored in ComponentTypes registry.
	///  		model.js scripts are assumed to NOT be async, by default.  But model-config.json can change that.
	/// TODO: Timeout if async, and resolve is not called.
	/// TODO: If async, check body of module for reference to "resolve" and/or "reject";
	/**
	 * Apply model process supplied from the component type registry.
	 * @param {SlingData} content
	 * @param {Model} model - a model object
	 */
	function processModel(content, model){
		return function(resolve,reject){
			/// Do a look up in the "resource registry" to find potential instructions on how to further process the model
			resourceType = content["_sling_resourceType"] || content["sling:resourceType"] || (content._meta?content._meta._sling_resourceType:"");
			var cmp = typeRegistry.get(resourceType);
			try{
				if(cmp.model){
					if(_.isFunction(cmp.model.process)){
						cmp.model.process(model, _.defaults(
							{resolve: resolve,
							reject: reject, 
							slingData: content,
							processSling: processSlingUtility,
							_:_}, 						
							externalUtilities));
						if(!cmp.model.async) resolve();
					}else{
						resolve();
					}
				}else{
					resolve();
				}
			
			}catch(error){

				throw({
					message: "Error running model process function",
					path: cmp.model.path,					
					error: error,
					stack: error.stack
				});
			}
	
		}
	}





}



/////////////////////////////////////////////////////////////////////////////////
/**
 * Create a new model object, that has a non-ennumerable (hidden) key called `_meta` for storing meta data.  
 * This structure leaves the meta data  easily accesssible, but prevents it from appearing in the list of keys on the main model object.
 * @private
 */
function objectWithMeta(){
	var obj = {_meta:{}}
	Object.defineProperty(obj, "_meta", {
		enumerable: false
	});
	return obj;
}





/////////////////////////////////////////////////////////////////////////////////
/// Check if raw sling content piece is a component.
function isComponent(slingContent){
	return _.isObject(slingContent) && !_.isArray(slingContent) && (slingContent["_sling_resourceType"] ||  slingContent["sling:resourceType"] || (slingContent._meta && slingContent._meta._sling_resourceType));
}


/////////////////////////////////////////////////////////////////////////////////
// TODO: sling-connector unmangles key names already.  Maybe don't do it in model.js a second time?
function remapSlingKey(key){
	if(_.isNumber(key))return key;
	return key.replace(metaRegex,function(match,p1){if(p1.match(keepRegex)){return("_" + p1 + "_");}else{return("");}});
}






