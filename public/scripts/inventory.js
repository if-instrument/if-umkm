import { ORDER_STATUS, isInactiveStatus, orderStatusIs } from "./status-codes.js";

export function ingredientById(state, id) {
  return state.ingredients.find((item) => item.id === id);
}

export function productById(state, id) {
  return state.products.find((item) => item.id === id);
}

export function ingredientName(state, id) {
  const ingredient = ingredientById(state, id);
  return ingredient ? ingredient.name : "Bahan tidak ditemukan";
}

export function missingRecipeLines(state, product) {
  return (product?.recipe || []).filter((line) => {
    const ingredient = ingredientById(state, line.ingredientId);
    return Boolean(!line.ingredientId || !ingredient || isInactiveStatus(ingredient.status));
  });
}

export function missingModifierOptions(state, modifier) {
  return (modifier?.options || []).filter((option) => {
    const ingredient = ingredientById(state, option.ingredientId);
    const replacement = ingredientById(state, option.replacementIngredientId);
    return Boolean(
      !option.ingredientId ||
      !ingredient ||
      isInactiveStatus(ingredient.status) ||
      (option.action === "replace" && (!option.replacementIngredientId || !replacement || isInactiveStatus(replacement.status)))
    );
  });
}

export function missingRecipeSummary(state, product) {
  const missing = missingRecipeLines(state, product);
  if (!missing.length) return "";
  return missing
    .map((line) => line.templateName || line.ingredientName || line.templateId || "Template bahan")
    .join(", ");
}

export function missingModifierSummary(state, modifier) {
  const missing = missingModifierOptions(state, modifier);
  if (!missing.length) return "";
  return missing
    .map((option) => {
      const base = option.templateName || option.ingredientName || option.templateId || option.name || "Bahan";
      if (option.action === "replace" && !ingredientById(state, option.replacementIngredientId)) {
        return `${base} / ${option.replacementTemplateName || option.replacementIngredientName || option.replacementTemplateId || "Bahan pengganti"}`;
      }
      return base;
    })
    .join(", ");
}

export function costingMethod(state) {
  return state.settings?.costingMethod || "average";
}

export function costingMethodLabel(state) {
  const labels = {
    average: "Average Cost",
    fifo: "FIFO",
    standard: "Standard Cost"
  };
  return labels[costingMethod(state)] || labels.average;
}

export function ingredientUnitCost(state, ingredient) {
  const method = costingMethod(state);
  if (method === "standard") return ingredient.standardCost ?? ingredient.avgCost;
  if (method === "fifo") return fifoUnitCost(ingredient, 1);
  return ingredient.avgCost;
}

export function ingredientCostForQty(state, ingredient, qty) {
  const method = costingMethod(state);
  if (method === "fifo") return fifoCostForQty(ingredient, qty);
  return ingredientUnitCost(state, ingredient) * qty;
}

export function ingredientStockValue(state, ingredient) {
  const method = costingMethod(state);
  if (method === "fifo") return fifoStockValue(ingredient);
  return ingredientUnitCost(state, ingredient) * ingredient.stock;
}

function recipeCogs(state, product) {
  return product.recipe.reduce((total, line) => {
    const ingredient = ingredientById(state, line.ingredientId);
    return total + (ingredient ? ingredientCostForQty(state, ingredient, line.qty) : 0);
  }, 0);
}

export function isStockedProduct(product) {
  return ["finished_good", "retail"].includes(product?.inventoryType || "made_to_order");
}

export function isPreorderStockedProduct(product) {
  return Boolean(product?.isPreorder) && isStockedProduct(product);
}

export function productCogs(state, product) {
  if (isStockedProduct(product)) {
    return Number(product.finishedUnitCost || 0) || recipeCogs(state, product);
  }
  return recipeCogs(state, product);
}

export function productModifiers(state, product) {
  const masterModifiers = Array.isArray(state.modifiers) ? state.modifiers : [];
  const assignedIds = product.modifierIds || [];
  const assignedMaster = masterModifiers.filter((modifier) => assignedIds.includes(modifier.id) && !isInactiveStatus(modifier.status));
  const legacy = (product.modifiers || []).filter((modifier) => !assignedMaster.some((item) => item.id === modifier.id));
  return [...assignedMaster, ...legacy];
}

function modifierOptions(modifier) {
  if (Array.isArray(modifier.options) && modifier.options.length) {
    return modifier.options.map((option) => ({
      ...option,
      id: option.id === "default" ? modifier.id : `${modifier.id}:${option.id}`,
      optionId: option.id,
      groupId: modifier.id,
      groupName: modifier.name,
      groupRequired: Boolean(modifier.requiredSelection),
      groupChoiceType: modifier.choiceType || (modifier.requiredSelection ? "single" : "multiple")
    }));
  }
  return [{
    id: modifier.id,
    optionId: modifier.id,
    groupId: modifier.id,
    groupName: modifier.name,
    groupRequired: Boolean(modifier.requiredSelection),
    groupChoiceType: modifier.choiceType || (modifier.requiredSelection ? "single" : "multiple"),
    name: modifier.name,
    priceDelta: modifier.priceDelta || 0,
    action: modifier.action,
    ingredientId: modifier.ingredientId,
    replacementIngredientId: modifier.replacementIngredientId || "",
    qty: modifier.qty
  }];
}

export function productModifierOptions(state, product) {
  return productModifiers(state, product).flatMap(modifierOptions);
}

function normalizedModifierAction(action) {
  return action === "replace" ? "replace" : "set";
}

export function modifierPrice(product, modifierIds = [], state = { modifiers: [] }) {
  return productModifierOptions(state, product)
    .filter((modifier) => modifierIds.includes(modifier.id))
    .reduce((total, modifier) => total + (modifier.priceDelta || 0), 0);
}

export function effectiveRecipe(product, modifierIds = [], state = { modifiers: [] }) {
  const quantities = new Map(product.recipe.map((line) => [line.ingredientId, line.qty]));
  productModifierOptions(state, product)
    .filter((modifier) => modifierIds.includes(modifier.id))
    .forEach((modifier) => {
      const qty = Number(modifier.qty) || 0;
      const action = normalizedModifierAction(modifier.action);
      if (action === "set") {
        quantities.set(modifier.ingredientId, qty);
      }
      if (action === "replace") {
        quantities.delete(modifier.ingredientId);
        quantities.set(modifier.replacementIngredientId, (quantities.get(modifier.replacementIngredientId) || 0) + qty);
      }
    });
  return [...quantities.entries()].filter(([, qty]) => qty > 0).map(([ingredientId, qty]) => ({ ingredientId, qty }));
}

export function productCogsWithModifiers(state, product, modifierIds = []) {
  if (isStockedProduct(product)) {
    return Number(product.finishedUnitCost || 0) || productCogs(state, product);
  }
  return effectiveRecipe(product, modifierIds, state).reduce((total, line) => {
    const ingredient = ingredientById(state, line.ingredientId);
    return total + (ingredient ? ingredientCostForQty(state, ingredient, line.qty) : 0);
  }, 0);
}

export function productAvailabilityWithModifiers(state, product, modifierIds = []) {
  const reservations = pendingStockReservations(state);
  if (isStockedProduct(product)) {
    if (isPreorderStockedProduct(product)) return 999999;
    return Math.max(0, Math.floor(Number(product.finishedStock || 0) - (reservations.products.get(product.id) || 0)));
  }
  const recipe = effectiveRecipe(product, modifierIds, state);
  if (!recipe.length) return 0;
  return Math.min(...recipe.map((line) => {
    const ingredient = ingredientById(state, line.ingredientId);
    const heldQty = reservations.ingredients.get(line.ingredientId) || 0;
    const availableStock = ingredient ? Math.max(0, Number(ingredient.stock || 0) - heldQty) : 0;
    return ingredient && !isInactiveStatus(ingredient.status) ? Math.floor(availableStock / line.qty) : 0;
  }));
}

export function productAvailability(state, product) {
  const reservations = pendingStockReservations(state);
  if (isStockedProduct(product)) {
    if (isPreorderStockedProduct(product)) return 999999;
    return Math.max(0, Math.floor(Number(product.finishedStock || 0) - (reservations.products.get(product.id) || 0)));
  }
  if (!product.recipe.length) return 0;
  return Math.min(
    ...product.recipe.map((line) => {
      const ingredient = ingredientById(state, line.ingredientId);
      const heldQty = reservations.ingredients.get(line.ingredientId) || 0;
      const availableStock = ingredient ? Math.max(0, Number(ingredient.stock || 0) - heldQty) : 0;
      return ingredient && !isInactiveStatus(ingredient.status) ? Math.floor(availableStock / line.qty) : 0;
    })
  );
}

function pendingStockReservations(state) {
  const reservations = { products: new Map(), ingredients: new Map() };
  (state.transactions || [])
    .filter((order) => orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER))
    .forEach((order) => {
      (order.items || order.lastOrderItems || []).forEach((item) => {
        const qty = Number(item.qty || 0);
        if (qty <= 0) return;
        if (item.isPackaging && item.ingredientId) {
          addReservation(reservations.ingredients, item.ingredientId, qty);
          return;
        }
        const product = productById(state, item.productId);
        if (!product) return;
        if (isStockedProduct(product)) {
          if (isPreorderStockedProduct(product) || item.isPreorder) return;
          addReservation(reservations.products, product.id, qty);
          return;
        }
        const usage = Array.isArray(item.recipeUsage) && item.recipeUsage.length
          ? item.recipeUsage
          : effectiveRecipe(product, item.modifierIds || [], state).map((line) => ({ ...line, qty: Number(line.qty || 0) * qty }));
        usage.forEach((line) => {
          if (line.ingredientId) addReservation(reservations.ingredients, line.ingredientId, Number(line.qty || 0));
        });
      });
    });
  return reservations;
}

function addReservation(map, id, qty) {
  map.set(id, (map.get(id) || 0) + Number(qty || 0));
}

export function transactionTotals(state) {
  return state.transactions.reduce(
    (totals, trx) => {
      totals.revenue += trx.revenue;
      totals.cogs += trx.cogs;
      totals.profit += trx.profit;
      return totals;
    },
    { revenue: 0, cogs: 0, profit: 0 }
  );
}

function fifoUnitCost(ingredient, qty) {
  return fifoCostForQty(ingredient, qty) / qty;
}

function fifoCostForQty(ingredient, qty) {
  let remaining = qty;
  let total = 0;
  const lots = [...(ingredient.lots || [])]
    .filter((lot) => lot.remainingQty > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  lots.forEach((lot) => {
    if (remaining <= 0) return;
    const used = Math.min(remaining, lot.remainingQty);
    total += used * lot.unitCost;
    remaining -= used;
  });

  if (remaining > 0) total += remaining * ingredient.avgCost;
  return total;
}

function fifoStockValue(ingredient) {
  const lotValue = (ingredient.lots || []).reduce((total, lot) => total + lot.remainingQty * lot.unitCost, 0);
  const lotQty = (ingredient.lots || []).reduce((total, lot) => total + lot.remainingQty, 0);
  const untrackedQty = Math.max(ingredient.stock - lotQty, 0);
  return lotValue + untrackedQty * ingredient.avgCost;
}
