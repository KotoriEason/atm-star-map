export interface Item { key: string; id: string; name: string; englishName: string; mod: string; kind: 'item' | 'fluid' | 'chemical' | 'tag'; components?: string; icon?:string; iconStatus?:string; nameSource?:string; iconSource?:{status:string;model?:string;textures?:string[];note?:string;representative?:string} }
export interface Ingredient { options: string[]; count: number; consumed: boolean }
export interface Recipe {
  native?:boolean; virtual?:boolean; manualOnly?:boolean; chance?:number; notes?:string;
  coProducts?:{key:string;count:number;chance:number}[];
  id: string; type: string; machine: string; output: {key: string; count: number}; ingredients: Ingredient[];
  grid?: number[][]; power?: number; duration?: number; energy?: number; sourceCost?: number; idIsSynthetic: boolean;
  source: {path: string; line: number; sha256: string; url: string};
}
export interface Dataset {
  tags?:Record<string,string[]>;preferredRecipes?:Record<string,string>;preferredIngredients?:Record<string,string>;tagChoices?:Record<string,string>;
  reusableItems?:string[];
  acquisitions?:Record<string,{kind:string;title:string;description:string;conditions?:string;functions?:string;source:{path:string;line:number;sha256:string;url:string}}[]>;
  schema: number; id: string; pack: string; version: string; minecraft: string; loader: string;
  release: {fileId: number; url: string; sha256: string; verifiedOn: string};
  coverage: {level: string; runtimeVerified: boolean; filesScanned: number; parsedRecipes: number; unresolvedExpressions: number; note: string};
  defaultRecipe: string; items: Record<string, Item>; recipes: Recipe[];
  sources: {path: string; sha256: string; recipes: number; unresolved: number}[];
}
export interface Project {
  layout?:'radial'|'horizontal'|'vertical';
  id: string; name: string; datasetId: string; target: string; quantity: number;
  inventory: Record<string, number>; recipeChoices: Record<string, string>;
  ingredientChoices: Record<string, string>; notes: string; expanded: string[];
  createdAt: string; updatedAt: string;
}
export interface Workspace { schema: 1; projects: Project[]; activeId: string }
export interface Requirement {
  allocations?:Record<string,number>;
  path: string; key: string; required: number; owned: number; missing: number; consumed: boolean;
  recipeId?: string; batches: number; excess: number; children: Requirement[];
  cycle: boolean; limited: boolean; ready: boolean; ingredientIndex?: number; parentRecipeId?: string;
}
export interface Plan {root: Requirement; readiness: number; nodes: Requirement[]; allocated: Record<string, number>; truncated: boolean}
