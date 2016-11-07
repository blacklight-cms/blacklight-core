
var chalk=require("chalk");
var colors=["red","green","blue","yellow","white","grey"];

var c={};

colors.forEach(function(val){
	var style=chalk.styles[val];
	c[val]=function(msg){
		return style.open + msg + style.close;
	};
});

module.exports=c;