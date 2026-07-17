export type ChessSetStyle = {
  id: 'staunton-walnut'|'staunton-marble'|'minimal-ceramic'|'ornate-ebony'|'tournament-boxwood'
  name: string
  material: 'wood'|'marble'|'ceramic'|'ebony'|'boxwood'
  silhouette: 'staunton'|'minimal'|'ornate'
  light: string
  dark: string
  detail: number
}

export const chessSetStyles: ChessSetStyle[] = [
  { id:'staunton-walnut', name:'Walnut Staunton', material:'wood', silhouette:'staunton', light:'#f0d2a1', dark:'#4b2819', detail:3 },
  { id:'staunton-marble', name:'Carrara Marble', material:'marble', silhouette:'staunton', light:'#f4f0e6', dark:'#25464b', detail:4 },
  { id:'minimal-ceramic', name:'Minimal Ceramic', material:'ceramic', silhouette:'minimal', light:'#f7f3e8', dark:'#34465b', detail:1 },
  { id:'ornate-ebony', name:'Ornate Ebony', material:'ebony', silhouette:'ornate', light:'#d3ad66', dark:'#171311', detail:5 },
  { id:'tournament-boxwood', name:'Boxwood Tournament', material:'boxwood', silhouette:'staunton', light:'#e9cb8c', dark:'#7d3e20', detail:2 },
]
