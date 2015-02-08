
exports.async = true;

exports.process=function(model, utils){
	setTimeout(function(){
		model._jcr_uuid = "Hey, my crazy UUID!";
		utils.resolve()
	}, 1000)
}


