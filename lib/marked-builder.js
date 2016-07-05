var marked=require("marked");
var _ = require("lodash");

module.exports= function(options){

	var markedRenderer=new marked.Renderer();

	marked.setOptions({
		renderer: markedRenderer,
		gfm: true,
		tables: true,
		breaks: true,
		pedantic: false,
		sanitize: false,
		smartLists: true,
		smartypants: true
	});

	///////////////////////////////////////////////////////////////////////////////
	markedRenderer.link=function(href, title, text){
		var target="";
		if(href.match(/^http/)){target=" target='_blank'";}
		return "<a href=\"" + href +  "\"" + target + ">" + text + "</a>"; 
	};

	///////////////////////////////////////////////////////////////////////////////
	markedRenderer.image = function(href, title, text) {
		var customAttributes="", directive=text.match(/^img:(.*)/), captionStart="", captionEnd="", containerStyle="";
		var attributes={};

		if(directive){
			text=title||"";
			var parts=directive[1].split("|");
			for(var i=0; i<parts.length;i++){
				var nameVal=parts[i].split("=");
				attributes[nameVal[0]]=nameVal[1];
				if(nameVal[0]!=="class")
					customAttributes += (" " + nameVal[0] + "=\"" + nameVal[1] + "\"");
			}
		}

		var classes=(attributes["class"]||"").split(" ");
		var width=attributes["width"];

		var caption=(title || text || "");
		if(caption && classes.indexOf("caption")>-1){
			if(width){containerStyle=" style='width:" + width + "px'";}
			captionStart= ("<div class='image-container " + classes.join(" ") + "'" + containerStyle + ">");
			captionEnd="<div class='image-caption'>" + caption + "</div></div>";
		}




		var out = captionStart + '<img class="' + classes.join(" ") + '" src="' + href + '" alt="' + text + '"';
		if (title) {
			out += ' title="' + title + '"';
		}
		out += customAttributes;
		out += this.options.xhtml ? '/>' : '>';
		out += captionEnd;
		return out;
	};

	return marked;
};

