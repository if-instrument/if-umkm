from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

class ToolDefinition(BaseModel):
    name: str
    version: str = "1.0"
    description: str
    input_schema: Dict[str, Any]
    output_schema: Optional[Dict[str, Any]] = None
    permission: str = "read"
    timeout: int = 10
    enabled: bool = True
    application_scope: str = "all"

class ToolRegistry:
    """
    Domain-Agnostic Tool Registry.
    Contains schemas of remote tools exported by external client applications.
    """

    _registry: Dict[str, ToolDefinition] = {}

    @classmethod
    def register_tool(cls, tool: ToolDefinition):
        cls._registry[tool.name] = tool

    @classmethod
    def get_tool(cls, tool_name: str) -> Optional[ToolDefinition]:
        return cls._registry.get(tool_name)

    @classmethod
    def list_tools(cls, application_id: Optional[str] = None) -> List[ToolDefinition]:
        if not application_id:
            return list(cls._registry.values())
        return [
            t for t in cls._registry.values()
            if t.application_scope in ["all", application_id]
        ]

# Register Standard Application Tools
ToolRegistry.register_tool(
    ToolDefinition(
        name="get_product_performance",
        version="1.0",
        description="Returns product performance statistics including sales volume, 90d trend, category benchmarks, gross margin, and stock turnover.",
        input_schema={
            "type": "object",
            "properties": {
                "period": {"type": "string", "default": "90d", "description": "Time window e.g. 30d, 90d, 1y"},
                "limit": {"type": "integer", "default": 10, "description": "Max products to return"}
            }
        },
        permission="analytics.product.read",
        application_scope="all"
    )
)

ToolRegistry.register_tool(
    ToolDefinition(
        name="get_sales_summary",
        version="1.0",
        description="Returns aggregate sales summary including total revenue, order count, average basket size, and growth rates.",
        input_schema={
            "type": "object",
            "properties": {
                "period": {"type": "string", "default": "30d"}
            }
        },
        permission="analytics.sales.read",
        application_scope="all"
    )
)

ToolRegistry.register_tool(
    ToolDefinition(
        name="get_inventory_status",
        version="1.0",
        description="Returns inventory stock levels, low-stock warnings, and valuation.",
        input_schema={
            "type": "object",
            "properties": {
                "low_stock_only": {"type": "boolean", "default": False}
            }
        },
        permission="inventory.read",
        application_scope="all"
    )
)

ToolRegistry.register_tool(
    ToolDefinition(
        name="get_product_list",
        version="1.0",
        description="Returns the full catalog list of products with details like SKU, name, price, cost price, stock, category, and status. Use when the user asks to see, view, list, or search products.",
        input_schema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "default": "", "description": "Search term for product name or category"},
                "limit": {"type": "integer", "default": 20, "description": "Max products to return"}
            }
        },
        permission="products.read",
        application_scope="all"
    )
)

ToolRegistry.register_tool(
    ToolDefinition(
        name="get_recipe_ingredients",
        version="1.0",
        description="Returns available raw materials, ingredients stock, and HPP unit cost for recipe composition.",
        input_schema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "default": ""}
            }
        },
        permission="recipe.read",
        application_scope="all"
    )
)
