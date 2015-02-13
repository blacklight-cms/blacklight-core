
// TODO:  this is all very groovy, but you need to actually use blacklight-express to get the full set of test cases working the way you want at the web-page level
//				that will likely require a fakse SlingConnector, which returns your faked jcr-content
//  TODO:  Some kind of meta-data for status codes?...ie. some way to set status codes on the response.
/// TODO: Add curly braces to /components/model/file/with/runtime/error/error.js ... you get a line number on console...how to get that info into my error message?



/// TODO:  Split component-types into component-registry.js  and  component-type.js
//	TODO:  Run in express mode, you're way over-synthesizing the test environment.  Forget unit testing.  Think functional testing

/// TODO: Classes of error:  shut down entire service/app, refuse to deliver a given page, deliver a page but with component in error state,  others?

/// TODO: If you throw, the server should shut down.

/// TODO: ability to configure blacklight as to how to behave for different classes of error, in particular whether to shut down if any component code is bad.
////		[mymodel].js:  Runtime errors, syntax errors, errors intentionally thrown by custom code
////  		[mymodel].hbs  Runtime errors, syntax errors
////		Any of these should probably be "bring the server down" kind of issues, when in production.  
////			Assumption being that the error will be logged and alerted to the ops team, and a replacement server willbe automatically respawned
////			Other assumption being, you're running some kind of cluster with auto-restart. PM2?
////		When in dev mode, arguably you could leave the server up.  But there's not much value there.

/// TODO: You probably want to pre-load all component code, so you can find errors as early as possible

///   If you get something other than what you've documented to accept, that's a programmer error. 
///	  If the input is something you've documented to accept but you can't process right now, that's an operational error.

var _ = require("lodash");
var createRegistry = require("../../lib/component-types").createRegistry
var models = require("../../lib/models");
var slingData=require("./jcr-content.json");
var separator = "\n\n\n----------------------------------------------------------------------\n";
require("es6-promise").polyfill();

var lastPromise=Promise.resolve();

var registry = createRegistry({componentPaths: __dirname + "/components"});


var tryScenario = function(val, key){
	lastPromise = lastPromise.then(function(){
		return models.generateModelFromRaw(slingData, registry, {problem: key})
		.then(function(model){
			console.log(separator,key);
			console.log(separator,model.data);
			try{
				console.log(registry.render(model.data));
			}catch(error){
				console.log("Error during template render: ", error.message, error.stack);
			}
		})
		.catch(function(error){
			console.log("Error during model processing: ", error.message, error.stack);
		})
	});

}


//_.each(slingData.problem_data, tryScenario);

var key="model_file_with_runtime_error"
tryScenario(slingData[key], key);

lastPromise.then(function(){
	console.log(separator, "All done.")
});

