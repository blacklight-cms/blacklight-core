

exports.process = function (model, directive) {
	console.log(directive.problem);
	model.problem = model[directive.problem];
	console.log("Hi.  the problem: ", model.problem);
}