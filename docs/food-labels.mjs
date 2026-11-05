// Text vocabulary supplied automatically to an open-vocabulary detector.
// This is not a photo-reference catalogue and requires no setup by the user.
const groups=[
 ['Proteínas',[
  ['chicken','Frango',['chicken meat']],['ground beef','Carne picada',['minced meat','ground meat']],['pork','Porco',[]],['fish','Peixe',[]],['canned tuna','Atum',['tuna can','tuna']],['eggs','Ovos',['egg carton','egg']],['hamburger','Hambúrgueres',['burger']]
 ]],
 ['Hidratos e acompanhamentos',[
  ['rice','Arroz',['rice bag','bag of rice']],['pasta','Massa',['pasta package','spaghetti']],['couscous','Cuscuz',[]],['potatoes','Batata',['potato']],['flour','Farinha',[]],['oats','Aveia',[]]
 ]],
 ['Legumes',[
  ['garlic','Alho',[]],['carrots','Cenoura',['carrot']],['mushrooms','Cogumelos',['mushroom']],['onions','Cebola',['onion']],['lettuce','Alface',[]],['tomatoes','Tomate',['tomato']],['broccoli','Brócolos',[]],['bell pepper','Pimento',['bell peppers']],['cucumber','Pepino',[]]
 ]],
 ['Fruta',[
  ['bananas','Bananas',['banana']],['apples','Maçãs',['apple']],['oranges','Laranjas',['orange','clementine']],['lemons','Limões',['lemon']],['pears','Peras',['pear']],['grapes','Uvas',[]]
 ]],
 ['Laticínios',[
  ['milk','Leite',['milk carton']],['yogurt','Iogurte',['yoghurt']],['cheese','Queijo',[]],['butter','Manteiga',[]]
 ]],
 ['Conservas e leguminosas',[
  ['beans','Feijão',['canned beans','kidney beans','black beans']],['chickpeas','Grão-de-bico',[]],['lentils','Lentilhas',[]],['tomato sauce','Polpa de tomate',['tomato paste','canned tomatoes']],['sweetcorn','Milho',['canned corn','corn']],['olives','Azeitonas',[]],['olive oil','Azeite',[]]
 ]],
 ['Bebidas',[
  ['water bottle','Água',['bottled water']],['juice','Sumo',['orange juice','apple juice']],['coffee','Café',[]],['tea','Chá',[]]
 ]],
 ['Lanche',[
  ['bread','Pão',[]],['potato chips','Batatas fritas',['chips','crisps']],['cookies','Bolachas',['biscuits']],['chocolate','Chocolate',['milk chocolate']],['breakfast cereal','Cereais',['cereal']]
 ]],
 ['Temperos',[
  ['salt','Sal',[]],['black pepper','Pimenta',[]],['spices','Temperos',[]]
 ]]
];
export const FOODS=groups.flatMap(([category,items])=>items.map(([label,name,aliases])=>({label,name,category,aliases:[label,...aliases]})));
export const FOOD_PROMPT=FOODS.map(food=>food.label+'.').join(' ');
export const normalizeLabel=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function foodForLabel(label){
 const normalized=normalizeLabel(label),padded=' '+normalized+' ';
 const matches=FOODS.flatMap(food=>food.aliases.filter(alias=>padded.includes(' '+normalizeLabel(alias)+' ')).map(alias=>({food,alias:normalizeLabel(alias)}))).sort((a,b)=>b.alias.length-a.alias.length);
 if(!matches.length)return null;
 const best=matches[0];
 // A label combining unrelated foods is not a defensible identification.
 if(matches.some(match=>match.food!==best.food&&!best.alias.includes(match.alias)))return null;
 return best.food;
}
