import parser from './grammar.pegjs';
import makeDraggable from './draggable';


const DEBUG = true;


const _dialogContainer = document.createElement("div");
_dialogContainer.className = "dialog-container";

const _loadedScenes = { };
let _currentScene, _container, _player;

// interaction implementations
const functions = {

    // 2nd arg: { entity, action:"says", message }
    says: (scene, actedOnEntity, { message }) => new Promise(acc => {
        const dialog = document.createElement('span');
        dialog.className = 'dialog';
        dialog.style.top = (actedOnEntity.__domElement.style.top.replace('px', '') - 40) + 'px';
        dialog.style.left = actedOnEntity.__domElement.style.left;
        dialog.innerText = message;

        document.body.appendChild(dialog);

        const delay = 500 + (message.length * 45);
        setTimeout(() => {
            dialog.remove();
            acc();
        }, delay);
    }),

    // 2nd arg: { entity, action:"gets", status }
    gets: (scene, actedOnEntity, { entity, status }) => {
        actedOnEntity.statusses.push(status);
        if (entity === 'player') {
            displayMsg(`you are ${status}`);
        }
        else {
            displayMsg(`${entity} is ${status}`)
        }
    },

    // 2nd arg: { entity, action:"give", item, toEntity }
    give: (scene, actedOnEntity, {entity, item, toEntity}) => {
        const entityObj = scene.entities[entity];
        if (removeFromArray(entityObj.items, item)) {
            const toEntityObj = scene.entities[toEntity];
            toEntityObj.items.push(item);
            toEntity = toEntity === 'player' ? 'you' : toEntity;
            if (entity === 'player') {
                displayMsg(`you give ${item} to ${toEntity}`);
            }
            else {
                displayMsg(`${entity} gives ${item} to ${toEntity}`);
            }
        }
        else {
            console.warn(`${entity} does not have the item ${item}`);
        }
    },

    // 2nd arg: { entity, action:"move_to", position, time }
    move_to: async (scene, actedOnEntity, { position, time}) => {
        const movingRight = actedOnEntity.position.x < position.x;
        flip(actedOnEntity.__domElement, movingRight);
        actedOnEntity.__domElement.style.transition = `top ${time}ms ease 0s, left ${time}ms ease 0s`;
        actedOnEntity.__domElement.style.top = scene.transform(position.y) + 'px';
        actedOnEntity.__domElement.style.left = scene.transform(position.x) + 'px';
        actedOnEntity.position = position;
        await delayAsync(time);
    },

    // 2nd arg: { action: "goto_scene", scene }
    goto_scene: (_, actedOnEntity, {scene}) => runScene(scene),

    // 2nd arg: { action: "new_objective",  objective }
    new_objective: (scene, actedOnEntity, { objective }) => {
        _player.objectives.push(objective);
        displayMsg(`objective started: ` + objective);
    },

    // 2nd arg: { action: "completed_objective",  objective }
    completed_objective: (scene, actedOnEntity, { objective }) => {
        removeFromArray(_player.objectives, objective);
        _player.completedObjectives.push(objective);
        displayMsg(`objective completed: ${objective}`);
    },

    // 2nd arg: { action: "display", text }
    display: (scene, actedOnEntity, { text }) => {
        displayMsg(text);
    },

    // 2nd arg: { entity, action:"receives", item }
    receives: (scene, actedOnEntity, { entity, item }) => {
        actedOnEntity.items.push(item);
        if (entity === 'player') {
            displayMsg(`you receive ${item}`);
        }
        else {
            displayMsg(`${entity} receives ${item}`);
        }
    },

    // 2nd arg: { entity, action:"disappear" }
    disappear: (scene, actedOnEntity) => {
        delete scene.entities[actedOnEntity.id];
        actedOnEntity.__domElement.remove();
    },

    // 2nd arg: { entity, action:"move_to", position, time }
    conditional: async (scene, actedOnEntity, interaction) => {
        if (checkConditions(interaction.ifBranch.conditions, scene)) {
            await executeInteractions(interaction.ifBranch.interactions, scene);
        }
        else {
            if (interaction.elseIfBranches) {
                for (let i = 0; i < interaction.elseIfBranches.length; i++) {
                    const elseIf = interaction.elseIfBranches[i];
                    if (checkConditions(elseIf.conditions, scene)) {
                        await executeInteractions(elseIf.interactions, scene);
                        return;
                    }
                }
            }
            if (interaction.elseBranch) {
                await executeInteractions(interaction.elseBranch.interactions, scene);
            }
        }
    }
};

const conditionFunctions = {
    has: (scene, {entity, item}) => {
        const entityObj = scene.entities[entity];
        return entityObj.items.includes(item);
    },

    is: (scene, {entity, status}) => {
        const entityObj = scene.entities[entity];
        return entityObj.statusses.includes(status);
    },

    objective_started: (scene, {objective}) => {
        return _player.objectives.includes(objective);
    },

    objective_completed: (scene, {objective}) => {
        return _player.completedObjectives.includes(objective);
    },
};

// execute interactions
async function executeInteractions(interactionNode, scene) {
    if (interactionNode.type === 'par_interaction') {
        await Promise.all(interactionNode.interactions.map(interaction => executeInteractions(interaction, scene)));
    }
    else if (interactionNode.type === 'seq_interaction') {
        await executeInteractions(interactionNode.interaction, scene);
        if (interactionNode.next) {
            await executeInteractions(interactionNode.next, scene);
        }
    }
    else {
        await executeInteraction(interactionNode, scene);
    }
}

async function executeInteraction(interaction, scene) {
    const actedOnEntity = interaction.entity && scene.entities[interaction.entity];

    if (functions[interaction.action] !== undefined) {
        await functions[interaction.action](scene, actedOnEntity, interaction);
    }
    else {
        console.warn('interaction function not found', interaction.action);
    }
}

function checkConditions(conditions, scene) {
    for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];

        if (conditionFunctions[condition.type] !== undefined) {
            const val = conditionFunctions[condition.type](scene, condition);
            if (val === condition.negate) // instead of checking the two possible combinations
                return false;
        }
        else {
            console.warn('condition evaluator not found', condition.type);
            return false;
        }
    }
    return true;
}

function displayMsg(msg) {
    const message = document.createElement('div');
    message.innerText = msg;
    _dialogContainer.insertBefore(message, _dialogContainer.firstChild);
}

function ensureProps(entity){
    if (entity.statusses === undefined) {
        entity.statusses = [];
        entity.items = [];
    }
}

function drawScene(scene) {
    const drawStart = Date.now();
    Object.values(scene.entities).forEach(entity => drawEntity(entity, scene));
    scene.interactions.forEach(interaction => bindInteraction(interaction, scene));
    scene.entities['player'] = _player;
    if (DEBUG) console.log(`drawing took ${Date.now() - drawStart}ms`);
}

function drawEntity(entity, scene) {
    entity.__domElement = document.createElement('img');
    entity.__domElement.title = entity.id;
    entity.__domElement.src = `${entity.sprite}`;
    entity.__domElement.style.position = 'absolute';
    entity.__domElement.style.top = `${scene.transform(entity.position.y)}px`;
    entity.__domElement.style.left = `${scene.transform(entity.position.x)}px`;
    const size = `${scene.transform(entity.size)}px`;
    entity.__domElement.style.height = size;
    entity.__domElement.style.width = size;
    _container.appendChild(entity.__domElement);
    if (DEBUG) makeDraggable(entity.__domElement);
}

function bindInteraction(interaction, scene) {
    const entity = scene.entities[interaction.entity];
    try {
        entity.__domElement.onclick = async () => {
            if (entity.__interacting) return;
            entity.__interacting = true;
            await executeInteractions(interaction.interactions, scene);
            entity.__interacting = false;
        };
    }
    catch (e) {
        console.log('binding interaction to entity failed', interaction, entity, e);
    }
}

function removeFromArray (array, item) {
    const index = array.indexOf(item);
    if (index !== -1) {
        array.splice(index, 1);
        return true;
    }
    return false;
}

function flip(element, right) {
    element.className = right ? 'flipped' : '';
}

function delayAsync(ms) {
    return new Promise(acc => {
        setTimeout(acc, ms);
    });
}

// parsing and running scenes
export async function interpret(code) {
    let ast;
    try {
        const parseStart = Date.now();
        ast = await parser.parse(code);
        if (DEBUG) console.log(`parsing took ${Date.now() - parseStart}ms`)
    }
    catch (e) {
        throw new Error(`Syntax error at ${e.location.start.line}:${e.location.start.offset}: ${e.message}`);
    }

    const scene = {
        entities: Object.create(null),
        interactions: [],
        ...ast.scene
    };
    ast.lines.forEach(node => {
        switch (node.type) {
            case 'entity':
                ensureProps(node);
                scene.entities[node.id] = node;
                break;
            case 'interaction':
                scene.interactions.push(node);
                break;
            case 'comment':
                break;
            default:
                console.log('unknown node', node.type);
                break;
        }
    });

    return scene;
}

async function getFileContent(url) {
    const loadStart = Date.now();
    const response = await fetch(url);
    const content = await response.text();
    if (DEBUG) console.log(`downloading took ${Date.now() - loadStart}ms`);
    return content;
}

async function runScene(scenePath) {

    if (!scenePath.toLowerCase().endsWith(".pcas"))
        scenePath += ".pcas";

    let scene;

    if (_loadedScenes[scenePath] !== undefined) {
        scene = _loadedScenes[scenePath];
    }
    else {
        const code = await getFileContent(scenePath);
        try {
            scene = await interpret(code);
        }
        catch (e) {
            return console.error(`could not parse the pca code at '${scenePath}'`, e);
        }

        _loadedScenes[scenePath] = scene;
        if (DEBUG) console.log(`loaded scene: ${scenePath}`);
    }


    if (DEBUG) console.log("scene resolution", scene.w, scene.h);
    scene.scale = _container.__width / scene.w;
    if (DEBUG) console.log("scene scaling", scene.scale);
    scene.transform = originalSize => scene.scale * originalSize;
    _container.style.height = scene.transform(scene.h) + 'px';
    _container.style['background-image'] = `url(${scene.background})`;

    // remove current scene if any
    if (_currentScene !== undefined) {
        delete _currentScene.entities.player;
        Object.values(_currentScene.entities).forEach(entity => entity.__domElement.remove());
    }
    _currentScene = scene;

    drawScene(scene);
    displayMsg(`you are ${scene.id}`);
}

export async function start(firstScenePath, container) {
    _player = {
        objectives: [],
        completedObjectives: [],
        statusses: [],
        items: []
    };

    _container = container;
    const actualWidth = container.offsetWidth;
    const actualHeigth = container.offsetHeight;
    if (DEBUG) console.log("actual resolution", actualWidth, actualHeigth);

    _container.__height = actualHeigth;
    _container.__width = actualWidth;

    if (DEBUG) container.onclick = ev => {
        ev.cancelBubble = true;
        console.log("clicked at", '(' + parseInt(ev.clientX / _currentScene.scale) + ', ' + parseInt(ev.clientY / _currentScene.scale) + ')');
    };

    document.body.appendChild(_dialogContainer);
    await runScene(firstScenePath, {w: actualWidth, h: actualHeigth});
}
