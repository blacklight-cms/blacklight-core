
var c=require("./colors")
var _=require("lodash");

module.exports={
    get:function(category){
        var logTypes  = ["debug","info","warning","error", "critical"];
        var typeColors= {debug:"blue",info:"green",warning:"yellow",error:"red", critical:"magenta"};
        var logger={};

        logTypes.forEach((logType)=>{
            logger[logType]=function(){
                var args = Array.prototype.slice.call(arguments);
                var msg=args.shift();  var color=c[typeColors[logType]];
                args.unshift(color(logType.toUpperCase() + ":"), c.white(category + ":"), c.yellow(msg));
                console.log.apply(null, args);
            };         
        })
    
        return logger;
    }
};


