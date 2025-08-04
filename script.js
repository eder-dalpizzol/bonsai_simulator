// Importa as bibliotecas necessárias do Three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- VARIÁVEIS GLOBAIS ---
// Variáveis principais do Three.js
let renderer, raycaster, mouse, clock;
// Cenas e câmeras para os modos de visualização da árvore e de depuração
let treeScene, debugScene;
let treeCamera, debugCamera;
// Controles de órbita para cada cena
let treeControls, debugControls;
// Armazena os controles que estão ativos no momento
let activeControls;

// Variáveis de estado da árvore
let treeData = null, currentSeed = 0, prunedIds = new Set();
// Variáveis para o modo de depuração e modelo personalizado
let branchTemplate = null, loadedFileInfo = {};
// Objeto atualmente destacado pelo mouse
let highlightedObject = null;
// Chave da cena ativa ('tree' ou 'debug')
let activeSceneKey = 'tree';
// Array para armazenar os objetos que estão caindo e constantes de física
let fallingObjects = [];
const gravity = 9.8;


// --- ELEMENTOS DA UI ---
// Mapeia os elementos do HTML para variáveis JavaScript para fácil acesso
const ui = {
    treeControlsPanel: document.getElementById('tree-controls'),
    debugControlsPanel: document.getElementById('debug-controls'),
    seedInput: document.getElementById('seedInput'),
    generateBtn: document.getElementById('generateBtn'),
    randomBtn: document.getElementById('randomBtn'),
    copyLinkBtn: document.getElementById('copyLinkBtn'),
    saveBtn: document.getElementById('saveBtn'),
    loadInput: document.getElementById('loadInput'),
    debugModeBtn: document.getElementById('debugModeBtn'),
    treeModeBtn: document.getElementById('treeModeBtn'),
    modelInput: document.getElementById('modelInput'),
    useModelBtn: document.getElementById('useModelBtn'),
    infoFilename: document.getElementById('info-filename'),
    infoDims: document.getElementById('info-dims'),
    infoScale: document.getElementById('info-scale'),
    infoPivot: document.getElementById('info-pivot'),
    debugPointsCheck: document.getElementById('debugPointsCheck'),
};

// --- INICIALIZAÇÃO ---
/**
 * Função principal que inicializa a aplicação.
 */
function init() {
    clock = new THREE.Clock(); // Relógio para calcular o tempo delta na animação
    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('main-canvas');
    // Configura o renderizador WebGL
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true; // Habilita sombras
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);

    // Inicializa o Raycaster para detecção de cliques e hover
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Configura as duas cenas (árvore e depuração)
    setupTreeScene();
    setupDebugScene();
    // Configura todos os ouvintes de eventos (cliques, etc.)
    setupEventListeners();

    // Define o modo inicial para a visualização da árvore
    switchMode('tree');
    // Carrega o estado da árvore a partir dos parâmetros da URL, se houver
    loadStateFromURL();
    // Inicia o loop de animação
    animate();
}

/**
 * Configura a cena principal onde a árvore é exibida.
 */
function setupTreeScene() {
    treeScene = new THREE.Scene();
    treeScene.background = new THREE.Color(0x87ceeb); // Cor de céu azul
    treeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    treeCamera.position.set(15, 15, 15);
    treeControls = new OrbitControls(treeCamera, renderer.domElement);
    treeControls.enableDamping = true; // Suaviza o movimento da câmera

    // Adiciona luzes para iluminar a cena
    const ambientLight = new THREE.AmbientLight(0x666666);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 15, 10);
    directionalLight.castShadow = true; // Luz direcional projeta sombras
    // Adiciona um plano de chão
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshLambertMaterial({ color: 0x228b22 }));
    ground.rotation.x = -Math.PI / 2; // Rotaciona para ficar deitado
    ground.receiveShadow = true; // Chão recebe sombras
    treeScene.add(ambientLight, directionalLight, ground);
}

/**
 * Configura a cena de depuração para visualização e ajuste de modelos 3D.
 */
function setupDebugScene() {
    debugScene = new THREE.Scene();
    debugScene.background = new THREE.Color(0x333333); // Fundo cinza escuro
    debugCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    debugCamera.position.set(1, 1, 1);
    debugControls = new OrbitControls(debugCamera, renderer.domElement);
    debugControls.enableDamping = true;

    // Adiciona luzes e helpers visuais (grid e eixos)
    const ambientLight = new THREE.AmbientLight(0xaaaaaa);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 2, 1);
    const gridHelper = new THREE.GridHelper(2, 10);
    const axesHelper = new THREE.AxesHelper(1);
    debugScene.add(ambientLight, directionalLight, gridHelper, axesHelper);
}

/**
 * Adiciona todos os ouvintes de eventos para os elementos da UI e a janela.
 */
function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    ui.generateBtn.addEventListener('click', () => generateNewTree(parseInt(ui.seedInput.value)));
    ui.randomBtn.addEventListener('click', () => generateNewTree(Math.floor(Math.random() * 100000)));
    ui.copyLinkBtn.addEventListener('click', copyTreeLink);
    ui.saveBtn.addEventListener('click', saveTreeToFile);
    ui.loadInput.addEventListener('change', loadTreeFromFile);
    ui.debugModeBtn.addEventListener('click', () => switchMode('debug'));
    ui.treeModeBtn.addEventListener('click', () => switchMode('tree'));
    ui.modelInput.addEventListener('change', handleModelUpload);
    ui.useModelBtn.addEventListener('click', () => {
        branchTemplate = debugScene.getObjectByName("loadedModel");
        alert('Template do modelo atualizado!');
        switchMode('tree');
    });
    ui.debugPointsCheck.addEventListener('change', buildTreeView);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
}

// --- LÓGICA DE MODO ---
/**
 * Alterna entre os modos 'tree' e 'debug'.
 * @param {string} mode - O modo para o qual alternar ('tree' ou 'debug').
 */
function switchMode(mode) {
    activeSceneKey = mode;
    if (mode === 'tree') {
        // Mostra os controles da árvore e esconde os de depuração
        ui.treeControlsPanel.classList.remove('hidden');
        ui.debugControlsPanel.classList.add('hidden');
        // Ativa os controles de câmera da árvore
        treeControls.enabled = true;
        debugControls.enabled = false;
        activeControls = treeControls;
    } else {
        // Mostra os controles de depuração e esconde os da árvore
        ui.treeControlsPanel.classList.add('hidden');
        ui.debugControlsPanel.classList.remove('hidden');
        // Ativa os controles de câmera de depuração
        treeControls.enabled = false;
        debugControls.enabled = true;
        activeControls = debugControls;
    }
}

// --- LÓGICA DE DEPURAÇÃO ---
/**
 * Lida com o upload de um arquivo de modelo 3D (GLB).
 * @param {Event} event - O evento de mudança do input de arquivo.
 */
async function handleModelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
        // Carrega e normaliza o modelo
        const { model, info } = await loadAndNormalizeModel(url);
        loadedFileInfo = { ...info, filename: file.name };
        updateDebugInfo(); // Atualiza as informações na UI
        // Remove o modelo antigo, se houver
        const existingModel = debugScene.getObjectByName("loadedModel");
        if (existingModel) debugScene.remove(existingModel);
        model.name = "loadedModel";
        debugScene.add(model);
        ui.useModelBtn.disabled = false; // Habilita o botão para usar o modelo
    } catch (error) { alert("Erro: " + error.message); }
    URL.revokeObjectURL(url); // Libera a memória do URL do objeto
    event.target.value = ''; // Limpa o input para permitir o mesmo upload novamente
}

/**
 * Carrega um modelo GLB, normaliza sua escala e centraliza seu pivô.
 * @param {string} url - A URL do arquivo do modelo.
 * @returns {Promise<{model: THREE.Mesh, info: object}>} - O modelo carregado e informações sobre ele.
 */
function loadAndNormalizeModel(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (gltf) => {
            let model = null;
            // Encontra a primeira malha (Mesh) no modelo carregado
            gltf.scene.traverse(child => { if (child.isMesh) model = child; });
            if (!model) return reject(new Error("Nenhuma malha (Mesh) encontrada."));

            // Calcula o tamanho original do modelo
            const originalBox = new THREE.Box3().setFromObject(model);
            const originalSize = originalBox.getSize(new THREE.Vector3());
            if (originalSize.y === 0) return reject(new Error("Altura do modelo é 0."));

            // Normaliza a escala para que a altura seja 1
            const scaleFactor = 1.0 / originalSize.y;
            model.scale.set(scaleFactor, scaleFactor, scaleFactor);
            // Ajusta a posição para que o pivô fique na base do modelo
            const scaledBox = new THREE.Box3().setFromObject(model);
            model.position.y = -scaledBox.min.y;
            model.material = new THREE.MeshLambertMaterial({ color: 0xcccccc });

            const info = {
                originalDims: `(${originalSize.x.toFixed(2)}, ${originalSize.y.toFixed(2)}, ${originalSize.z.toFixed(2)})`,
                scaleFactor: scaleFactor.toFixed(4),
                finalPivot: `(${model.position.x.toFixed(2)}, ${model.position.y.toFixed(2)}, ${model.position.z.toFixed(2)})`
            };
            resolve({ model, info });
        }, undefined, () => reject(new Error("Falha ao carregar arquivo GLB.")));
    });
}

/**
 * Atualiza o painel de informações de depuração com os dados do modelo carregado.
 */
function updateDebugInfo() {
    ui.infoFilename.textContent = loadedFileInfo.filename || 'Nenhum';
    ui.infoDims.textContent = loadedFileInfo.originalDims || 'N/A';
    ui.infoScale.textContent = loadedFileInfo.scaleFactor || 'N/A';
    ui.infoPivot.textContent = loadedFileInfo.finalPivot || 'N/A';
}

// --- LÓGICA DE GERAÇÃO DA ÁRVORE ---
// Materiais e geometria para a visualização de esqueleto (pontos)
const skeletonPointMaterial = new THREE.PointsMaterial({ color: 0x4488ff, size: 0.3 });
const leafPointMaterial = new THREE.PointsMaterial({ color: 0x00ff00, size: 0.5 });
const pointGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));

/**
 * Gera uma nova árvore com base em uma semente (seed).
 * @param {number} seed - O número usado para inicializar o gerador de números aleatórios.
 * @param {Set<number>} initialPrunedIds - Um conjunto de IDs de partes da árvore que devem ser podadas inicialmente.
 */
function generateNewTree(seed, initialPrunedIds = new Set()) {
    if (isNaN(seed)) return;
    currentSeed = seed;
    prunedIds = initialPrunedIds;
    ui.seedInput.value = currentSeed;
    // Cria um gerador de números pseudo-aleatórios para garantir que a mesma semente sempre gere a mesma árvore
    const random = new Mulberry32(currentSeed);
    let idCounter = 0;
    // Gera a estrutura de dados da árvore de forma recursiva
    treeData = generateBranchData(null, 0, random, () => idCounter++);
    // Constrói a representação visual da árvore
    buildTreeView();
}

/**
 * Constrói (ou reconstrói) a representação visual 3D da árvore.
 */
function buildTreeView() {
    // Remove a árvore antiga da cena, se existir
    const existingTree = treeScene.getObjectByName("tree");
    if (existingTree) disposeOfObject(existingTree);

    const treeObject = new THREE.Object3D();
    treeObject.name = "tree";

    // Decide se constrói a árvore como um esqueleto de pontos ou como uma malha completa
    if (ui.debugPointsCheck.checked) {
        buildSkeletonFromData(treeObject, treeData, prunedIds);
    } else {
        buildMeshFromData(treeObject, treeData, prunedIds);
    }

    treeScene.add(treeObject);
    updateURL(); // Atualiza a URL para refletir o estado atual da árvore
}

/**
 * Gera recursivamente a estrutura de dados para um galho e seus filhos.
 * @param {object|null} parentData - Os dados do galho pai.
 * @param {number} level - O nível de profundidade do galho na árvore.
 * @param {Mulberry32} random - O gerador de números aleatórios.
 * @param {function} getId - Uma função que retorna um ID único.
 * @returns {object|null} - Os dados do galho gerado.
 */
function generateBranchData(parentData, level, random, getId) {
    if (level > 5) return null; // Limita a profundidade da recursão
    const branchData = { id: getId(), level, children: [] };
    branchData.segments = Array.from({ length: 3 }, (_, i) => ({ id: getId(), level, segmentIndex: i }));
    if (level >= 3) branchData.leaf = { id: getId() }; // Adiciona folhas em níveis mais altos
    // Gera um número aleatório de galhos filhos
    const numBranches = Math.floor(random.next() * 3) + 2;
    for (let i = 0; i < numBranches; i++) {
        const childData = generateBranchData(branchData, level + 1, random, getId);
        if (childData) {
            // Define uma rotação aleatória para o galho filho
            childData.rotation = { x: (random.next() - 0.5) * Math.PI * 0.8, z: (random.next() - 0.5) * Math.PI * 0.8 };
            branchData.children.push(childData);
        }
    }
    return branchData;
}

/**
 * Constrói a visualização de "esqueleto" da árvore usando pontos.
 * @param {THREE.Object3D} parent - O objeto pai onde os pontos serão adicionados.
 * @param {object} data - Os dados do galho atual.
 * @param {Set<number>} idsToSkip - IDs de partes que não devem ser renderizadas (podadas).
 */
function buildSkeletonFromData(parent, data, idsToSkip) {
    if (idsToSkip.has(data.id)) return;

    const segmentLength = (4 - data.level * 0.6) / 3;
    let currentParent = parent;

    const basePoint = new THREE.Points(pointGeometry, skeletonPointMaterial);
    currentParent.add(basePoint);

    for (const segmentData of data.segments) {
        if (idsToSkip.has(segmentData.id)) continue;
        const segmentNode = new THREE.Object3D();
        segmentNode.position.y = segmentLength;
        currentParent.add(segmentNode);
        const jointPoint = new THREE.Points(pointGeometry, skeletonPointMaterial);
        segmentNode.add(jointPoint);
        currentParent = segmentNode;
    }

    if (currentParent === parent) return;

    if (data.leaf && !idsToSkip.has(data.leaf.id)) {
        const leafPoint = new THREE.Points(pointGeometry, leafPointMaterial);
        leafPoint.userData = { id: data.leaf.id };
        currentParent.add(leafPoint);
    }

    for (const childData of data.children) {
        const pivot = new THREE.Object3D();
        pivot.rotation.x = childData.rotation.x;
        pivot.rotation.z = childData.rotation.z;
        currentParent.add(pivot);
        buildSkeletonFromData(pivot, childData, idsToSkip);
    }
}

// Material para as folhas
const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x006400 });

/**
 * Constrói a visualização de "malha" da árvore usando cilindros (ou modelos) e icosaedros.
 * @param {THREE.Object3D} parent - O objeto pai onde as malhas serão adicionadas.
 * @param {object} data - Os dados do galho atual.
 * @param {Set<number>} idsToSkip - IDs de partes que não devem ser renderizadas (podadas).
 */
function buildMeshFromData(parent, data, idsToSkip) {
    if (idsToSkip.has(data.id)) return;

    const totalLength = 4 - data.level * 0.6;
    const radius = 0.2 - data.level * 0.035;
    const segmentLength = totalLength / 3;

    let currentParent = parent;
    let topPosition;

    for (const segmentData of data.segments) {
        if (idsToSkip.has(segmentData.id)) continue;

        let segment;
        if (branchTemplate) {
            // Usa o modelo 3D personalizado se estiver definido
            segment = branchTemplate.clone();
            segment.material = branchTemplate.material.clone();
            segment.scale.set(radius * 2, segmentLength, radius * 2);
            segment.position.y = (segmentData.segmentIndex === 0) ? 0 : segmentLength;
            topPosition = segmentLength;
        } else {
            // Usa um cilindro padrão
            segment = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, segmentLength),
                new THREE.MeshLambertMaterial({ color: 0x8b4513 })
            );
            segment.position.y = (segmentData.segmentIndex === 0) ? segmentLength / 2 : segmentLength;
            topPosition = segmentLength / 2;
        }

        segment.castShadow = true;
        segment.userData = segmentData; // Armazena dados no objeto para interação
        currentParent.add(segment);
        currentParent = segment;
    }

    if (currentParent === parent) return;

    // Adiciona as folhas (icosaedros)
    if (data.leaf && !idsToSkip.has(data.leaf.id)) {
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 - data.level * 0.2), leavesMaterial.clone());
        leaves.castShadow = true;
        leaves.position.y = topPosition;
        leaves.userData = { id: data.leaf.id };
        currentParent.add(leaves);
    }

    // Constrói recursivamente os galhos filhos
    for (const childData of data.children) {
        const pivot = new THREE.Object3D();
        pivot.position.y = topPosition;
        pivot.rotation.x = childData.rotation.x;
        pivot.rotation.z = childData.rotation.z;
        currentParent.add(pivot);
        buildMeshFromData(pivot, childData, idsToSkip);
    }
}

// --- LÓGICA DE INTERAÇÃO E ESTADO ---
/**
 * Adiciona os IDs de um galho e seus descendentes ao conjunto de poda.
 * @param {object} branchData - Os dados do galho a ser podado.
 * @param {object} segmentData - Os dados do segmento específico que foi clicado.
 */
function pruneFromSegment(branchData, segmentData) {
    const startIndex = segmentData.segmentIndex;
    for (let i = startIndex; i < branchData.segments.length; i++) {
        prunedIds.add(branchData.segments[i].id);
    }
    if (startIndex === 0) {
        prunedIds.add(branchData.id);
    }
    if (branchData.leaf) {
        prunedIds.add(branchData.leaf.id);
    }
    if (branchData.children) {
        branchData.children.forEach(addBranchIdsToPruneSet);
    }
}

/**
 * Lida com o clique do mouse para podar a árvore.
 * @param {MouseEvent} event - O evento do mouse.
 */
function onMouseDown(event) {
    if (activeSceneKey !== 'tree' || event.button !== 0 || ui.debugPointsCheck.checked) return;

    if (highlightedObject) {
        const id = highlightedObject.userData.id;
        const isLeaf = highlightedObject.geometry.type === 'IcosahedronGeometry';

        let canPrune = false;
        if (isLeaf) {
            canPrune = true;
        } else {
            const { branch, segment } = findNodeById(treeData, id);
            if (branch && segment && branch.level > 0) {
                canPrune = true;
            }
        }

        if (canPrune) {
            // --- Cria a peça que cai ---
            // Clona o objeto destacado (e seus filhos) para criar a peça que cai.
            const fallingPiece = highlightedObject.clone();
            fallingPiece.traverse(child => {
                if (child.isMesh) {
                    child.material = child.material.clone(); // Clona materiais para não afetar o original.
                    child.material.emissive.setHex(0x000000); // Remove o destaque.
                }
            });

            // Obtém a posição e rotação globais do objeto destacado.
            const worldPos = new THREE.Vector3();
            highlightedObject.getWorldPosition(worldPos);
            const worldQuat = new THREE.Quaternion();
            highlightedObject.getWorldQuaternion(worldQuat);

            // Adiciona a peça que cai à cena na mesma posição/rotação.
            treeScene.add(fallingPiece);
            fallingPiece.position.copy(worldPos);
            fallingPiece.quaternion.copy(worldQuat);
            
            // Adiciona o objeto ao array de animação com velocidades aleatórias.
            fallingObjects.push({
                mesh: fallingPiece,
                velocity: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1, (Math.random() - 0.5) * 2),
                angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5)
            });

            // --- Atualiza o modelo de dados e reconstrói a árvore estática ---
            if (isLeaf) {
                prunedIds.add(id);
            } else {
                const { branch, segment } = findNodeById(treeData, id);
                pruneFromSegment(branch, segment); // A verificação de validade já foi feita.
            }
            buildTreeView(); // Reconstrói a árvore com as partes podadas.
            highlightedObject = null;
        }
    }
}

/**
 * Adiciona recursivamente todos os IDs de um galho (e seus filhos) ao conjunto de poda.
 * @param {object} branchData - Os dados do galho.
 */
function addBranchIdsToPruneSet(branchData) {
    if (!branchData) return;
    prunedIds.add(branchData.id);
    if (branchData.leaf) prunedIds.add(branchData.leaf.id);
    if (branchData.segments) branchData.segments.forEach(s => prunedIds.add(s.id));
    if (branchData.children) branchData.children.forEach(addBranchIdsToPruneSet);
}

/**
 * Encontra um nó (galho ou segmento) na estrutura de dados da árvore pelo seu ID.
 * @param {object} data - A estrutura de dados da árvore para pesquisar.
 * @param {number} id - O ID a ser encontrado.
 * @returns {object} - Um objeto contendo o galho e/ou segmento encontrado.
 */
function findNodeById(data, id) {
    if (!data) return {};
    if (data.id === id) return { branch: data };
    if (data.leaf && data.leaf.id === id) return { branch: data };
    if (data.segments) {
        const segment = data.segments.find(s => s.id === id);
        if (segment) return { branch: data, segment };
    }
    if (data.children) {
        for (const child of data.children) {
            const found = findNodeById(child, id);
            if (found.branch) return found;
        }
    }
    return {};
}

/**
 * Carrega o estado da árvore (semente e IDs podados) a partir de um parâmetro na URL.
 */
function loadStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const state = urlParams.get('state');
    let seed = 12345; // Semente padrão
    let ids = [];
    if (state) {
        const parts = state.split('_p');
        seed = parseInt(parts[0]);
        if (parts[1] && parts[1].length) ids = parts[1].split(',').map(Number);
    }
    generateNewTree(seed, new Set(ids));
}

/**
 * Atualiza o parâmetro 'state' na URL com a semente atual e os IDs podados.
 */
function updateURL() {
    const stateString = `${currentSeed}_p${Array.from(prunedIds).join(',')}`;
    const url = new URL(window.location);
    url.searchParams.set('state', stateString);
    window.history.replaceState({}, '', url);
}

/**
 * Copia o link atual da árvore (com seu estado) para a área de transferência.
 */
function copyTreeLink() {
    updateURL();
    navigator.clipboard.writeText(window.location.href).then(() => alert('Link copiado!'));
}

/**
 * Salva o estado atual da árvore em um arquivo JSON.
 */
function saveTreeToFile() {
    const state = { seed: currentSeed, pruned: Array.from(prunedIds) };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tree-state-${currentSeed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

/**
 * Carrega o estado da árvore de um arquivo JSON selecionado pelo usuário.
 * @param {Event} event - O evento de mudança do input de arquivo.
 */
function loadTreeFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const state = JSON.parse(e.target.result);
            if (typeof state.seed === 'number' && Array.isArray(state.pruned)) {
                generateNewTree(state.seed, new Set(state.pruned));
            } else { alert('Arquivo JSON inválido.'); }
        } catch (error) { alert('Erro ao ler o arquivo.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- LOOP DE ANIMAÇÃO E FUNÇÕES AUXILIARES ---

/**
 * Anima todos os objetos no array `fallingObjects`.
 * @param {number} delta - O tempo decorrido desde o último quadro.
 */
function animateFallingObjects(delta) {
    // Itera de trás para frente para que a remoção de itens não afete o loop.
    for (let i = fallingObjects.length - 1; i >= 0; i--) {
        const obj = fallingObjects[i];

        // Aplica a gravidade à velocidade vertical.
        obj.velocity.y -= gravity * delta;
        obj.mesh.position.addScaledVector(obj.velocity, delta);

        // Aplica a rotação.
        obj.mesh.rotation.x += obj.angularVelocity.x * delta;
        obj.mesh.rotation.y += obj.angularVelocity.y * delta;
        obj.mesh.rotation.z += obj.angularVelocity.z * delta;

        // Remove o objeto se ele caiu para fora da vista.
        if (obj.mesh.position.y < -10) {
            disposeOfObject(obj.mesh);
            fallingObjects.splice(i, 1);
        }
    }
}

/**
 * Atualiza as coordenadas do mouse em formato normalizado (-1 a +1).
 * @param {MouseEvent} event - O evento de movimento do mouse.
 */
function onMouseMove(event) {
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

/**
 * Verifica se o mouse está sobre um objeto interativo e o destaca.
 */
function checkHighlight() {
    if (activeSceneKey !== 'tree') return;

    // Desabilita o destaque no modo de visualização de esqueleto
    if (ui.debugPointsCheck.checked) {
        if (highlightedObject) {
            highlightedObject.material.emissive.setHex(0x000000);
            highlightedObject = null;
        }
        return;
    }

    // Lança um raio da câmera através da posição do mouse
    raycaster.setFromCamera(mouse, treeCamera);
    const treeObject = treeScene.getObjectByName("tree");
    if (!treeObject) return;
    const intersects = raycaster.intersectObjects(treeObject.children, true);

    // Remove o destaque do objeto anterior
    if (highlightedObject) {
        highlightedObject.material.emissive.setHex(0x000000);
        highlightedObject = null;
    }

    // Destaca o primeiro objeto intersectado que seja uma malha com ID
    const firstIntersect = intersects.find(i => i.object.isMesh && i.object.userData.id !== undefined);
    if (firstIntersect) {
        highlightedObject = firstIntersect.object;
        highlightedObject.material.emissive.setHex(0xffff00); // Cor amarela para destaque
    }
}

/**
 * Libera a memória da geometria e do material de um objeto e seus filhos.
 * @param {THREE.Object3D} obj - O objeto a ser descartado.
 */
function disposeOfObject(obj) {
    obj.traverse(child => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
    if(obj.parent) obj.parent.remove(obj);
}

/**
 * Lida com o redimensionamento da janela do navegador.
 */
function onWindowResize() {
    const canvasContainer = document.getElementById('canvas-container');
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    // Atualiza a proporção das câmeras e o tamanho do renderizador
    treeCamera.aspect = width / height;
    treeCamera.updateProjectionMatrix();
    debugCamera.aspect = width / height;
    debugCamera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

/**
 * O loop de animação principal, chamado a cada quadro.
 */
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); // Calcula o delta time

    activeControls.update(); // Atualiza os controles da câmera

    // Renderiza a cena ativa
    if (activeSceneKey === 'tree') {
        checkHighlight(); // Verifica o destaque do mouse
        animateFallingObjects(delta); // Anima os objetos que caem
        renderer.render(treeScene, treeCamera);
    } else {
        renderer.render(debugScene, debugCamera);
    }
}

/**
 * Um gerador de números pseudo-aleatórios (PRNG) simples para garantir resultados consistentes.
 * @param {number} seed - A semente inicial.
 */
function Mulberry32(seed) {
    this.a = seed;
    this.next = function() { var t = this.a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// --- INICIAR APLICAÇÃO ---
// Chama a função de inicialização para começar tudo.
init();