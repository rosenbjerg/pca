// Point & Click Adventure (pca) Grammar
{
	const spriteSize = 80;
    const placeholders = { player: { type:'string', value:'player' } };

	function resolveTime(amount, unit) {
    	switch (unit) {
        	case 'ms':
            	return amount;
                break;
        	case 's':
            	return amount * 1000;
                break;
        	case 'm':
            	return amount * 1000 * 60;
                break;
        }
    }
    function indexPlaceholder(name, value) {
    	placeholders[name] = { ...value };
        return {type: "comment", content: "# placeholder indexed"};
    }
    function lookupPlaceholder(name, allowedTypes) {
    	const node = placeholders[name];
        if (node === undefined) {
        	return error("Placeholder lookup for '"+name+"' failed");
        }
        if (allowedTypes !== undefined && !allowedTypes.includes(node.type)) {
        	return error("Invalid type used: '" + node.type + "' but requires: " + allowedTypes.join(", "))
        }
        return node.value;
    }
    function relativeToAbsoluteSize(size) {
    	return spriteSize * size;
    }
}


Start
	= _ scene:Scene NEWLINE lines:Lines
    { return { scene, lines } }

Lines
	= head:LineEntity NEWLINE tail:Lines { return [head, ...tail] }
	/ head:LineEntity NEWLINE? { return [head] }

Line = entity:LineEntity NEWLINE { return entity }
Lastline = entity:LineEntity NEWLINE? { return entity }
LineEntity = Entity / InteractionSpec / Comment / Placeholder

Comment "comment"
	= "#" content:[^\n\r]* { return { type: "comment", content: content.join("").trim() } }

Scene "scene"
	= "Scene" __ id:String __ "with" __ "background" __ background:String __ "with" __ "resolution" __ w:Integer "x" h:Integer
    { return { id, background, w, h } }

Placeholder "placeholder"
	= "Placeholder" __ name:VarName __ "=" __ value:VarValue { return indexPlaceholder(name, value) }

Entity "entity (actor / object)" = EntityType __ base:EntityBase { return { type: "entity", ...base } }
EntityType "entity type" = "Actor" / "Object"

EntityBase
	= id:VarNameOrString __ "with" __ "sprite" __ sprite:VarNameOrString __ size:Size __ "at" __ position:Position { return { id, sprite, size, position } }
	/ id:VarNameOrString __ "with" __ "sprite" __ sprite:VarNameOrString __ "at" __ position:Position { return { id, sprite, size: spriteSize, position } }

Position "position" = "(" _ x:Integer _ "," _ y:Integer _ ")" { return { x, y } }
Size "size" = "and" __ "size" __ size:Number { return relativeToAbsoluteSize(size) }

InteractionSpec "interaction specification"
	= "Interaction" __ "with" __ entity:VarNameOrString _ "{" _ interactions:Interactions _ "}"
    { return { type: "interaction", entity, interactions } }

Interactions "interactions"
    = ParallelInteraction
	/ SequentialInteractions
    / Interaction

Interaction "interaction"
    = ConditionalInteraction
    / SingleInteraction

SequentialInteractions "sequential interactions"
	= current:Interaction __ "->" ___ next:Interactions {
    	return { type: "seq_interaction", interaction: current, next }
    }

ParallelInteraction "parallel interaction"
	= head:Interaction __ "&" ___ tail:Interactions {
    	return { type: "par_interaction", interactions: [head, tail] }
    }

ConditionalInteraction "conditional interaction"
	= ifBranch:ConditionalIfBranch ___ elseIfBranches:ConditionalElseIfBranch+ ___ elseBranch:ConditionalElseBranch
	{ return { action: "conditional", ifBranch, elseIfBranches, elseBranch } }
	/ ifBranch:ConditionalIfBranch ___ elseIfBranches:ConditionalElseIfBranch+ { return { action: "conditional", ifBranch, elseIfBranches } }
	/ ifBranch:ConditionalIfBranch ___ elseBranch:ConditionalElseBranch	{ return { action: "conditional", ifBranch, elseBranch } }
	/ ifBranch:ConditionalIfBranch { return { action: "conditional", ifBranch } }

ConditionalIfBranch "if branch"
	= "if" __ conditions:Conditions _ "{" _ interactions:Interactions _ "}"
	{ return { action: "conditional", conditions, interactions } }

ConditionalElseIfBranch "else-if branch"
	= "else" __ "if" __ conditions:Conditions _ "{" _ interactions:Interactions _ "}"
	{ return { action: "conditional", conditions, interactions } }

ConditionalElseIfBranches "else-if branches"
	= head:ConditionalElseIfBranch __ tail:ConditionalElseIfBranches { return [head, ...tail] }
    / head:ConditionalElseIfBranch { return [head] }

ConditionalElseBranch "else branch"
	= "else" __ "{" _ interactions:Interactions _ "}"
	{ return { action: "conditional", interactions } }

Conditions "conditions"
	= not:("not" __)? head:Condition __ "and" __ tail:Conditions { head.negate=!!not; return [head, ...tail] }
    / not:("not" __)? head:Condition { head.negate=!!not; return [head] }

Condition "condition"
	= "objective" __ objective:VarNameOrString __ "started" { return { type: "objective_started", objective } }
	/ "objective" __ objective:VarNameOrString __ "completed" { return { type: "objective_completed", objective } }
	/ entity:VarNameOrString __ "is" __ status:VarNameOrString { return { entity, type: "is", status } }
	/ entity:VarNameOrString __ "has" __ item:VarNameOrString { return { entity, type: "has", item } }

SingleInteraction
    = "go" __ "to" __ "scene" __ scene:String { return { action: "goto_scene", scene } }
    / "player" __ "completes" __ "objective" __ objective:VarNameOrString { return { action: "completed_objective",  objective } }
    / "player" __ "is" __ "given" __ "objective" __ objective:VarNameOrString { return { action: "new_objective",  objective } }
	/ "display" __ text:String { return { action: "display", text } }
	/ entity:VarNameOrString __ "gets" __ status:VarNameOrString { return { entity, action:"gets", status } }
	/ entity:VarNameOrString __ "says" __ message:VarNameOrString { return { entity, action:"says", message } }
	/ entity:VarNameOrString __ "gives" __ item:VarNameOrString __ "to" __ toEntity:VarNameOrString { return { entity, action:"give", item, toEntity } }
	/ entity:VarNameOrString __ "receives" __ item:String { return { entity, action:"receives", item } }
	/ entity:VarNameOrString __ "disappears" { return { entity, action:"disappear" } }
    / entity:VarNameOrString __ "moves" __ "to" __ position:Position __ "over" __ time:Time  { return { entity, action:"move_to", position, time } }
	/ entity:VarNameOrString __ "moves" __ "to" __ position:Position { return { entity, action:"move_to", position, time: 0 } }
	/ entity:VarNameOrString __ "receives" __ item:VarNameOrString { return { entity, action:"receives", item } }

Time "time" = amount:Number __? unit:timeUnit { return resolveTime(amount, unit) }
timeUnit "time unit" = "m" / "s" / "ms"

VarNameOrString
	= value:String
    / name:VarName { return lookupPlaceholder(name, ["string"]) }

VarName "placeholder name" = [^ \t\r\n]+ { return text() }
VarValue "value"
	= value:String { return { type:'string', value } }
	/ value:Real { return { type:'float', value } }
	/ value:Integer { return { type:'int', value } }

String "string"
	= "'" chars:[^']+ "'" { return chars.join("") }
	/ '"' chars:[^"]+ '"' { return chars.join("") }
Number "number" = Real / Integer
Real "real" = "-"? [0-9]+ "." [0-9]+ { return parseFloat(text(), 10); }
Integer "integer" = "-"? [0-9]+ { return parseInt(text(), 10); }

_ "optional whitespace"	= [ \t\n\r]*
__ "inline whitespace" = [ \t]+
___ "whitespace" = [ \t\n\r]+

NEWLINE "line break(s)" = [\n\r]+ [ \t\n\r]*