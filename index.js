
dust = require("dustjs-linkedin");

var ex = module.exports;
var RESOURCE_TYPE = "sling:resourceType";

ex.render=function(content,options,callback){
	rtype=content[RESOURCE_TYPE];
	console.log("Resource type: " + rtype);
}



ex.resolveResource = function(){

}