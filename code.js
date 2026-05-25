figma.showUI(__html__, { width: 420, height: 580, title: 'Icon Creator' });

// On start — send current selection
sendSelectionToUI();

figma.on('selectionchange', sendSelectionToUI);

figma.ui.onmessage = async function (msg) {
  if (msg.type === 'get-selection') {
    sendSelectionToUI();
  }

  if (msg.type === 'create-icons') {
    try {
      await createIconComponentSet(msg.data);
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: String(err) });
    }
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

async function sendSelectionToUI() {
  var selection = figma.currentPage.selection;
  var nodes = [];

  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];
    var previewUrl = null;

    // PNG preview is more reliable than SVG export in dynamic-page mode
    try {
      var bytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'WIDTH', value: 96 }
      });
      previewUrl = 'data:image/png;base64,' + figma.base64Encode(bytes);
    } catch (e) {
      previewUrl = null;
    }

    nodes.push({
      id: node.id,
      name: node.name,
      svgData: previewUrl // data URL ready for <img src>
    });
  }

  figma.ui.postMessage({ type: 'selection', nodes: nodes });
}

async function createIconComponentSet(data) {
  var iconName = data.iconName;
  var variants = data.variants; // [{ nodeId, props: { Key: 'value', ... } }]
  var sizes = data.sizes;       // [24, 20, 16, 12, 8] (selected by user)

  if (!iconName || iconName.trim() === '') {
    figma.ui.postMessage({ type: 'error', message: 'Введите имя иконки' });
    return;
  }

  if (!variants || variants.length === 0) {
    figma.ui.postMessage({ type: 'error', message: 'Добавьте хотя бы один SVG-вариант' });
    return;
  }

  if (!sizes || sizes.length === 0) {
    figma.ui.postMessage({ type: 'error', message: 'Выберите хотя бы один размер' });
    return;
  }

  // Always sort sizes descending so the component set renders largest → smallest
  sizes = sizes.slice().sort(function(a, b) { return b - a; });

  // Remember bounding box of source nodes to place result nearby
  var sourceNodes = [];
  var refRight = null;
  var refY = null;
  for (var vi0 = 0; vi0 < variants.length; vi0++) {
    var sn = await figma.getNodeByIdAsync(variants[vi0].nodeId);
    if (sn && 'absoluteBoundingBox' in sn && sn.absoluteBoundingBox) {
      sourceNodes.push(sn);
      var bbox = sn.absoluteBoundingBox;
      var right = bbox.x + bbox.width;
      if (refRight === null || right > refRight) refRight = right;
      if (refY === null || bbox.y < refY) refY = bbox.y;
    }
  }

  // Find paint style "UI/icon/icon-gray-main"
  var iconStyleId = await resolveIconStyle();

  // Build base 24px component for each variant prop combination (in selection order)
  var bases = []; // [{ base24: ComponentNode, variant: { nodeId, props } }]
  for (var vi = 0; vi < variants.length; vi++) {
    var variant = variants[vi];
    var sourceNode = await figma.getNodeByIdAsync(variant.nodeId);

    if (!sourceNode) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Не удалось найти узел ' + variant.nodeId + '. Убедитесь, что он не был удалён с канваса.'
      });
      return;
    }

    // If colorMode is 'color' — don't repaint, pass null styleId to skip applyFillStyle
    var effectiveStyleId = variant.colorMode === 'color' ? null : iconStyleId;
    var base24 = await createVariantComponent(24, sourceNode, variant.props, effectiveStyleId);
    bases.push({ base24: base24, variant: variant });
  }

  // Assemble components: outer = variant, inner = size (all sizes of variant 0,
  // then all sizes of variant 1, …). With VERTICAL layout this produces a
  // natural stack grouped by variant.
  var needs24 = sizes.indexOf(24) !== -1;
  var components = [];
  for (var bi = 0; bi < bases.length; bi++) {
    var b = bases[bi];
    for (var si = 0; si < sizes.length; si++) {
      var size = sizes[si];
      var comp;
      if (size === 24) {
        comp = b.base24;
      } else {
        comp = b.base24.clone();
        comp.rescale(size / 24);
        comp.name = buildVariantName(size, b.variant.props);
      }
      components.push(comp);
    }
  }

  // Clean up unused 24px bases (when size 24 wasn't requested)
  if (!needs24) {
    for (var bi2 = 0; bi2 < bases.length; bi2++) bases[bi2].base24.remove();
  }

  // Combine into component set
  var componentSet = figma.combineAsVariants(components, figma.currentPage);
  componentSet.name = iconName;

  // Vertical auto-layout, hug both axes
  var PADDING = 20;
  var GAP = 10;

  componentSet.layoutMode = 'VERTICAL';
  componentSet.layoutWrap = 'NO_WRAP';
  componentSet.primaryAxisSizingMode = 'AUTO';
  componentSet.counterAxisSizingMode = 'AUTO';

  // Ensure all variant components are in-flow (combineAsVariants may have set
  // them up with absolute positioning)
  for (var ci = 0; ci < componentSet.children.length; ci++) {
    componentSet.children[ci].layoutPositioning = 'AUTO';
  }

  // Figma's combineAsVariants may sort children by variant property name —
  // force the order to match our `components` array (variant-outer, size-inner)
  for (var oi = 0; oi < components.length; oi++) {
    componentSet.insertChild(oi, components[oi]);
  }

  componentSet.paddingLeft = PADDING;
  componentSet.paddingRight = PADDING;
  componentSet.paddingTop = PADDING;
  componentSet.paddingBottom = PADDING;
  componentSet.itemSpacing = GAP;
  componentSet.counterAxisSpacing = GAP;

  // Dashed stroke #9747FF 50%
  componentSet.strokes = [{
    type: 'SOLID',
    color: { r: 0.592, g: 0.278, b: 1.0 },
    opacity: 0.5
  }];
  componentSet.strokeWeight = 1;
  componentSet.strokeAlign = 'INSIDE';
  componentSet.dashPattern = [8, 4];

  // Place component set to the right of the source nodes with a gap
  if (refRight !== null && refY !== null) {
    componentSet.x = refRight + 40;
    componentSet.y = refY;
  }

  figma.viewport.scrollAndZoomIntoView([componentSet]);
  figma.currentPage.selection = [componentSet];

  figma.ui.postMessage({ type: 'done', name: iconName });
}

function buildVariantName(size, props) {
  var propParts = [];
  var propKeys = Object.keys(props);
  for (var i = 0; i < propKeys.length; i++) {
    propParts.push(propKeys[i] + '=' + props[propKeys[i]]);
  }
  return 'Size=' + size + (propParts.length > 0 ? ', ' + propParts.join(', ') : '');
}

// Builds the BASE 24px component variant. Smaller sizes are produced by
// cloning this component and calling .rescale(size/24) — that way Figma
// proportionally scales the whole container (Icon + Container Size) for us.
//
// Follows the exact manual workflow that works in Figma UI:
//   1. Add icon to auto-layout with constraints CENTER/CENTER
//   2. Add Container Size with constrainProportions = true
//   3. Make icon ABSOLUTE
//   4. Center it within the container
//   5. Switch icon constraints to SCALE/SCALE
async function createVariantComponent(size, sourceNode, props, styleId) {
  var comp = figma.createComponent();
  comp.name = buildVariantName(size, props);
  comp.fills = [];
  comp.clipsContent = false;
  comp.constrainProportions = true;

  // Auto-layout: vertical, hug both axes. Container Size will drive dimensions.
  comp.layoutMode = 'VERTICAL';
  comp.primaryAxisSizingMode = 'AUTO';
  comp.counterAxisSizingMode = 'AUTO';
  comp.primaryAxisAlignItems = 'CENTER';
  comp.counterAxisAlignItems = 'CENTER';
  comp.paddingLeft = 0;
  comp.paddingRight = 0;
  comp.paddingTop = 0;
  comp.paddingBottom = 0;
  comp.itemSpacing = 0;

  // ── Step 1: clone icon, flatten to remove any rotation/transforms, add to
  // auto-layout with CENTER/CENTER constraints ──
  // IMPORTANT: do NOT rescale — preserve the source icon's original visual size.
  // Flatten is critical because SVG vectors in Figma often have rotation 90°
  // (Y-axis flip artefact). node.x sets the pre-rotation anchor, so a rotated
  // node positioned naively ends up outside the container.
  var iconClone = sourceNode.clone();
  comp.appendChild(iconClone);
  var icon = figma.flatten([iconClone], comp);
  icon.name = 'Icon';
  icon.constraints = { horizontal: 'CENTER', vertical: 'CENTER' };

  // Apply paint style AFTER flatten (flatten resets fills to baked colors)
  await applyFillStyle(icon, styleId);

  // ── Step 2: Container Size 24×24 with locked aspect ratio ──
  var container = figma.createRectangle();
  container.name = 'Container Size';
  container.fills = [];
  container.opacity = 0;
  container.resize(size, size);
  container.constrainProportions = true;
  container.locked = true;
  comp.appendChild(container);

  // ── Step 3: Make icon absolutely positioned ──
  icon.layoutPositioning = 'ABSOLUTE';

  // ── Step 4: Center the icon within the container ──
  icon.x = (size - icon.width) / 2;
  icon.y = (size - icon.height) / 2;

  // ── Step 5: Switch icon constraints to SCALE/SCALE ──
  // After this, rescaling the component proportionally scales the icon too.
  icon.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };

  return comp;
}

// Apply the paint style (by ID) to all vector leaf nodes in the tree.
// In documentAccess: "dynamic-page" mode, library style references MUST be
// set via setFillStyleIdAsync — direct fillStyleId assignment silently fails
// for foreign-library style IDs.
async function applyFillStyle(node, styleId) {
  if (!node || !styleId) return;

  if (typeof node.setFillStyleIdAsync === 'function') {
    try {
      await node.setFillStyleIdAsync(styleId);
    } catch (e) {
      // Some node types may not support style assignment — fall through to children
    }
  } else if ('fillStyleId' in node) {
    try {
      node.fillStyleId = styleId;
    } catch (e) {}
  }

  if ('children' in node && node.children) {
    for (var i = 0; i < node.children.length; i++) {
      await applyFillStyle(node.children[i], styleId);
    }
  }
}

// Resolve the icon paint style ID. Tries: (1) local & imported styles by name,
// (2) any existing icon component on the page whose "Icon" child references
// a matching style — this also works for foreign-library styles that don't
// surface via getLocalPaintStylesAsync.
async function resolveIconStyle() {
  var TARGET = 'UI/icon/icon-gray-main';

  function nameMatches(n) {
    return n === TARGET || n.endsWith('/' + TARGET);
  }

  // Strategy 1: local + imported paint styles
  try {
    var paintStyles = await figma.getLocalPaintStylesAsync();
    for (var s = 0; s < paintStyles.length; s++) {
      if (nameMatches(paintStyles[s].name)) return paintStyles[s].id;
    }
  } catch (e) {}

  // Strategy 2: scan existing COMPONENT_SET / COMPONENT nodes via the indexed
  // findAllWithCriteria lookup (fast even on huge pages).
  try {
    var existing = figma.currentPage.findAllWithCriteria({
      types: ['COMPONENT_SET', 'COMPONENT']
    });
    for (var i = 0; i < existing.length; i++) {
      var found = await findIconStyleInNode(existing[i], nameMatches);
      if (found) return found;
    }
  } catch (e) {}

  return null;
}

async function findIconStyleInNode(node, nameMatches) {
  if (!node) return null;

  // Read fillStyleId; use async getter when available (dynamic-page mode)
  var sid = null;
  if (typeof node.getFillStyleIdAsync === 'function') {
    try { sid = await node.getFillStyleIdAsync(); } catch (e) {}
  } else if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    sid = node.fillStyleId;
  }

  if (sid) {
    // Verify style name when possible — but if we can't resolve it (e.g. foreign
    // library), trust nodes literally named "Icon" since that's our convention.
    var matched = false;
    try {
      var style = typeof figma.getStyleByIdAsync === 'function'
        ? await figma.getStyleByIdAsync(sid)
        : figma.getStyleById(sid);
      if (style && nameMatches(style.name)) matched = true;
      else if (!style && node.name === 'Icon') matched = true;
    } catch (e) {
      if (node.name === 'Icon') matched = true;
    }
    if (matched) return sid;
  }

  if ('children' in node && node.children) {
    for (var i = 0; i < node.children.length; i++) {
      var found = await findIconStyleInNode(node.children[i], nameMatches);
      if (found) return found;
    }
  }

  return null;
}
