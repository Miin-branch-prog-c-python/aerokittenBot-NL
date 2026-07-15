const { Chess } = require('chess.js');

const games = new Map();

function getGame(playerId) {
  if (!games.has(playerId)) {
    const game = new Chess();
    games.set(playerId, game);
  }
  return games.get(playerId);
}

function deleteGame(playerId) {
  games.delete(playerId);
}

function makeMove(playerId, moveStr) {
  const game = getGame(playerId);
  try {
    const move = game.move(moveStr);
    if (!move) {
      return { error: "Coup invalide. Utilise la notation algébrique (ex: e2e4, Nf3, O-O)." };
    }
    const result = {
      success: true,
      move: move.san,
      fen: game.fen(),
      turn: game.turn() === 'w' ? 'white' : 'black',
      isCheck: game.isCheck(),
      isCheckmate: game.isCheckmate(),
      isDraw: game.isDraw(),
      isStalemate: game.isStalemate(),
      isGameOver: game.isGameOver(),
      board: formatBoard(game),
    };
    if (game.isGameOver()) {
      let reason = "Partie terminée. ";
      if (game.isCheckmate()) reason += "Échec et mat !";
      else if (game.isDraw()) reason += "Nulle.";
      else if (game.isStalemate()) reason += "Pat.";
      result.gameOverReason = reason;
      deleteGame(playerId);
    }
    return result;
  } catch (e) {
    return { error: "Coup invalide: " + e.message };
  }
}

function newGame(playerId) {
  deleteGame(playerId);
  const game = new Chess();
  games.set(playerId, game);
  return {
    success: true,
    fen: game.fen(),
    turn: 'white',
    board: formatBoard(game),
    message: "Nouvelle partie d'échecs commencée ! Les blancs jouent en premier. Fais ton coup (ex: e2e4).",
  };
}

function formatBoard(game) {
  const board = game.board();
  const rows = [];
  for (let r = 0; r < 8; r++) {
    const row = board[r].map(p => p ? p.color + p.type : '--').join(' ');
    rows.push((8 - r) + ' ' + row);
  }
  return rows.join('\n') + '\n  a  b  c  d  e  f  g  h';
}

function getPieceUnicode(fen) {
  const symbols = {
    'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
    'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟',
  };
  const rows = fen.split(' ')[0].split('/');
  return rows.map(row => {
    let line = '';
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        line += ' '.repeat(parseInt(ch) * 2);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        const key = color + ch.toLowerCase();
        line += symbols[key] || ch;
      }
      line += ' ';
    }
    return line;
  }).join('\n');
}

module.exports = { getGame, deleteGame, makeMove, newGame, formatBoard, getPieceUnicode };
