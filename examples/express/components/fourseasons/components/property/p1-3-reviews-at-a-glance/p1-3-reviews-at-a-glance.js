var _=require("lodash");
exports.async = true;

exports.process=function(model, $){

	$.sling.get("/content/fourseasons/en/properties/atlanta/offers/_jcr_content",
		function(err, data){
			console.log(data.property_disclaimer);
			model.property_disclaimer = null;
			$.resolve();
		});
}