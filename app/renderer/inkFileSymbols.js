const assert = require("assert");
const TokenIterator = ace.require("ace/token_iterator").TokenIterator;

function InkFileSymbols(inkFile, events) {
    this.inkFile = inkFile;
    this.events = events;

    this.dirty = true;
    this.inkFile.aceDocument.on("change", () => {
        this.dirty = true;

        // TODO: Don't do this on every change!
        this.parse();
    });
}

InkFileSymbols.prototype.parse = function() {

    var includes = [];

    var session = this.inkFile.getAceSession();

    const flowTypes = {
        knot:   { code: ".knot.declaration",   level: 1 },
        stitch: { code: ".stitch.declaration", level: 2 },
        choice: { code: "choice.label",        level: 3 },
        gather: { code: "gather.label",        level: 3 }
    };
    const topLevelInkFlow = { level: 0 };

    var symbolStack = [{
        flowType: topLevelInkFlow,
        innerSymbols: {},
        rangeIndex: []
    }];
    symbolStack.currentElement = function() {
        var currElement = this[this.length-1];
        return currElement;
    }

    var it = new TokenIterator(session, 0, 0);
    it.stepForward(); // this shouldn't be necessary should it?!
    for(var tok = it.getCurrentToken(); tok; tok = it.stepForward()) {

        // Token is some kind of name?
        if( tok.type.indexOf(".name") != -1 ) {

            var symbolName = tok.value;

            var flowType = null;
            for(var flowTypeName in flowTypes) {
                var flowTypeObj = flowTypes[flowTypeName];
                if( tok.type.indexOf(flowTypeObj.code) != -1 ) {
                    flowType = flowTypeObj;
                    break;
                }
            }

            // Not a knot/stitch/gather/choice (e.g. might be a variable name)
            if( !flowType )
                continue;
            
            while( flowType.level <= symbolStack.currentElement().flowType.level )
                symbolStack.pop();

            var symbol = {
                name: symbolName,
                flowType: flowType,
                row: it.getCurrentTokenRow(),
                column: it.getCurrentTokenColumn()
            };
            
            var parent = symbolStack.currentElement();
            if( parent != symbolStack )
                symbol.parent = parent;

            if( !parent.innerSymbols ) {
                parent.innerSymbols = [];
                parent.rangeIndex = [];
            }

            parent.innerSymbols[symbolName] = symbol;
            parent.rangeIndex.push({
                rowStart: symbol.row,
                symbol: symbol
            });

            symbolStack.push(symbol);
        }

        // INCLUDE
        else if( tok.type.indexOf("include.filepath") != -1 ) {
            includes.push(tok.value);
        }

    } // for token iterator

    this.symbols = symbolStack[0].innerSymbols;
    this.rangeIndex = symbolStack[0].rangeIndex;
    this.includes = includes;

    // TODO: Only fire when actually changed
    this.events.includesChanged(this.includes);

    this.dirty = false;
}

InkFileSymbols.prototype.symbolAtPos = function(pos) {

    if( this.dirty ) this.parse();

    // Range index is an index of all the symbols by row number,
    // nested into a hierarchy. 
    function symbolWithinIndex(rangeIndex) {

        if( !rangeIndex )
            return null;

        // Loop through range until we find the symbol,
        // then dig in to see if we can find a more accurate sub-symbol
        for(var i=0; i<rangeIndex.length; i++) {

            var nextRangeElement = null;
            if( i < rangeIndex.length-1 )
                nextRangeElement = rangeIndex[i+1];

            if( !nextRangeElement || pos.row < nextRangeElement.rowStart ) {
                var symbol = rangeIndex[i].symbol;
                return symbolWithinIndex(symbol.rangeIndex) || symbol;
            }
        }

        // Only if it's an empty range, so impossible?
        return null;
    }

    return symbolWithinIndex(this.rangeIndex);
}

InkFileSymbols.prototype.getSymbols = function() {
    if( this.dirty ) this.parse();
    return this.symbols;
}

InkFileSymbols.prototype.getIncludes = function() {
    if( this.dirty ) this.parse();
    return this.includes;
}

exports.InkFileSymbols = InkFileSymbols;