
exports.async = true;

exports.process=function(model, utilities){
	utilities.sling.get("/content/fourseasons/en/properties/_jcr_content",
		function(err, data){
			model.propertyHomeLastModifiedBy = data._cq_lastModifiedBy;
			utilities.resolve();
		});
}