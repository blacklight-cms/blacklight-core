/////////////////////////////////////////////////////////////////////////////////
var _ = require("lodash");
var ctypes = require("./component-types");

require("es6-promise").polyfill();

var metaRegex=/^(jcr|cq|sling|fsc|fsl|fsr):/g ;
var keepRegex=/^(jcr|cq|sling)$/ ;



/////////////////////////////////////////////////////////////////////////////////
exports.generatePageModel = function(slingPageContent){

	var lastPromise = Promise.resolve(); /// Initial (empty) promise, to chain subsequent promises to.
	var raw={page: slingPageContent};   /// TODO: validate slingPageContent is both a component and a page
	var result={};

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
				target[targetKey]={};
				lastPromise = lastPromise.then(function(){return new Promise(makeModel(val, target[targetKey]))} );
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

}


/////////////////////////////////////////////////////////////////////////////////
/// TODO: grab body for this loop from the text of "model.js" as stored in the component types registry
/// TODO: DEFINITELY include a model-config.json ...  should have cascading inheritence from parent folders.  Result stored in ComponentTypes registry.
///  		model.js scripts are assumed to NOT be async, by default.  But model-config.json can change that.

function makeModel(content, model){
	return function(resolve,reject){
		/// This is where you look up in the "resource registry" to find instructions on how to modelize
		resourceType = content["sling:resourceType"];
		//var ctype = ctypes.get(resourceType);
		//console.log(ctype);
		console.log("Start: " + resourceType)
		setTimeout(
			function(){				
				console.log("Done:" + resourceType)
				resolve();
			},
			50
		)
	}
}



/////////////////////////////////////////////////////////////////////////////////
function processNonComponent(content, target, targetKey){
	//content might be an object or a property, don't know yet.
	if(!_.isObject(content) ||  _.isArray(content))
		target[targetKey]=content;
	else{
		target[targetKey]={};
		_.forEach(content,function(val,key){
			processNonComponent(val, target[targetKey], remapSlingKey(key));
		});	
	}

}



/////////////////////////////////////////////////////////////////////////////////
function isComponent(content){
	return _.isObject(content) && !_.isArray(content) && content["sling:resourceType"];
}


/////////////////////////////////////////////////////////////////////////////////
function remapSlingKey(key){
	return key.replace(metaRegex,function(match,p1){if(p1.match(keepRegex)){return("_" + p1 + "_");}else{return("");}});
}









