

/// NEXT:  get templates generating against the model in this foo.js file.
///			one of your issues here is configuration of the compoentTypes object.
///			possibly it is best to create one that is designed to be passed around.
////		e.g.  componentTypes = require("component-types").getRegistry({appRoot:__dirname + "/components"})
////		configuration options:  preloadGlobs, appRoot,  searchPaths(?)


//// TODO: What is your plan for re-usable, shareable components?  
//// TODO: Question, does the site-creation environment prioritize the developer experience?  or the non-developer experience?  Answer: developer first.

var models = require("../../lib/models");
var raw=require("../jcr-content.json");

models.generatePageModel(raw)
	.then(function(result){
		//console.log("OK, got a page model");
		console.log("My page model:", JSON.stringify(result, null, "   "));
	})
	.catch(function(error){
		console.log("ERROR", error);
	});

