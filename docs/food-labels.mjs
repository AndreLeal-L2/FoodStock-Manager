// Text vocabulary supplied automatically to an open-vocabulary detector.
// This is not a photo-reference catalogue and requires no setup by the user.
const groups=[
 ['Proteínas',[
  ['chicken','Frango',['chicken meat']],['ground beef','Carne picada',['minced meat','ground meat']],['pork','Porco',[]],['fish','Peixe',[]],['canned tuna','Atum',['tuna can','tuna']],['eggs','Ovos',['egg carton','egg']],['hamburger','Hambúrgueres',['burger']]
 ]],
 ['Hidratos e acompanhamentos',[
  ['rice','Arroz',['rice bag','bag of rice']],['pasta','Massa',['pasta package','spaghetti']],['couscous','Cuscuz',[]],['potatoes','Batata',['potato']],['flour','Farinha',[]],['oats','Aveia',[]],['mashed potatoes','Puré de batata',['puré instantâneo']]
 ]],
 ['Legumes',[
  ['garlic','Alho',[]],['carrots','Cenoura',['carrot']],['mushrooms','Cogumelos',['mushroom']],['onions','Cebola',['onion']],['lettuce','Alface',[]],['tomatoes','Tomate',['tomato']],['broccoli','Brócolos',[]],['bell pepper','Pimento',['bell peppers']],['cucumber','Pepino',[]],['cabbage','Couve',['red cabbage','couve-roxa']]
 ]],
 ['Fruta',[
  ['bananas','Bananas',['banana']],['apples','Maçãs',['apple','maçã']],['oranges','Laranjas',['orange','clementine','laranja','clementina']],['lemons','Limões',['lemon','limão']],['pears','Peras',['pear','pera']],['grapes','Uvas',[]],['kiwi','Kiwi',[]],['lime','Lima',[]]
 ]],
 ['Laticínios',[
  ['milk','Leite',['milk carton']],['yogurt','Iogurte',['yoghurt']],['cheese','Queijo',[]],['butter','Manteiga',[]]
 ]],
 ['Conservas e leguminosas',[
  ['beans','Feijão',['canned beans','kidney beans','black beans']],['chickpeas','Grão-de-bico',[]],['lentils','Lentilhas',[]],['tomato sauce','Polpa de tomate',['tomato paste','canned tomatoes','extrato de tomate','molho de tomate','tomate pelado']],['sweetcorn','Milho',['canned corn','corn']],['olives','Azeitonas',[]],['olive oil','Azeite',[]]
 ]],
 ['Bebidas',[
  ['water bottle','Água',['bottled water']],['juice','Sumo',['orange juice','apple juice']],['coffee','Café',[]],['tea','Chá',[]]
 ]],
 ['Lanche',[
  ['bread','Pão',[]],['potato chips','Batatas fritas',['chips','crisps']],['cookies','Bolachas',['biscuits']],['chocolate','Chocolate',['milk chocolate']],['breakfast cereal','Cereais',['cereal']],['potato sticks','Batata palha',[]]
 ]],
 ['Temperos',[
  ['salt','Sal',[]],['black pepper','Pimenta',['pimenta preta']],['spices','Temperos',[]],['onion powder','Cebola em pó',[]]
 ]]
];
// Visually similar powders need readable labels, not guesses from texture.
const labelOnly=new Set(['salt','black pepper','spices','flour','onion powder']);
export const FOODS=groups.flatMap(([category,items])=>items.map(([label,name,aliases])=>({label,name,category,aliases:[label,name,...aliases]})));
export const FOOD_PROMPTS=groups.map(([,items])=>items.filter(([label])=>!labelOnly.has(label)).map(([label])=>label+'.').join(' ')).filter(Boolean);
export const FOOD_PROMPT=FOOD_PROMPTS.join(' ');
export function normalizeLabel(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const names=FOODS.flatMap(food=>food.aliases.map(alias=>({food,alias:normalizeLabel(alias)}))).sort((a,b)=>b.alias.length-a.alias.length);
export function foodForLabel(label){
 const normalized=normalizeLabel(label),padded=' '+normalized+' ';
 const matches=names.filter(({alias})=>padded.includes(' '+alias+' '));
 if(!matches.length)return null;
 const best=matches[0];
 // A label combining unrelated foods is not a defensible identification.
 if(matches.some(match=>match.food!==best.food&&!best.alias.includes(match.alias)))return null;
 return best.food;
}
