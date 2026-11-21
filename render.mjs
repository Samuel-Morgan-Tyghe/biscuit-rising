const palettes = [
  ['#542b4d', '#71364e', '#a4515f', '#ffa68c'],
  ['#283950', '#204e50', '#31796d', '#a7e7a1'],
  ['#29274e', '#423463', '#725484', '#ffc275'],
  ['#243552', '#476086', '#778dac', '#cdddff'],
];

function round(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function line(ctx, points, colour, width) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

function ellipse(ctx, x, y, w, h, colour) {
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

function text(ctx, value, x, y, colour, size, align = 'left') {
  ctx.fillStyle = colour;
  ctx.font = `900 ${size}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

function sign(ctx, label, x, y, w, colour, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  round(ctx, 2, 3, w, 29, 3, '#21162c99');
  round(ctx, 0, 0, w, 29, 3, colour, '#22142b');
  text(ctx, label, w / 2, 19, '#261632', 12, 'center');
  ctx.restore();
}

function backdrop(ctx, view, zones, width) {
  const { height, bottom } = view;
  const top = bottom + height;
  ctx.fillStyle = '#29203b';
  ctx.fillRect(-width, -height, width * 3, height * 3);
  zones.forEach((zone, index) => {
    const lower = index ? zone.y : -height;
    const upper = index === zones.length - 1 ? top + height : zone.endY;
    if (upper < bottom || lower > top) return;
    const [dark, light, grid, accent] = palettes[index];
    const offset = top - upper;
    const band = upper - lower;
    const shade = ctx.createLinearGradient(0, Math.max(-height, offset), width, Math.min(height * 2, offset + band));
    shade.addColorStop(0, light);
    shade.addColorStop(1, dark);
    ctx.fillStyle = shade;
    ctx.fillRect(-width, offset, width * 3, band + .5);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, offset, width, band + 1);
    ctx.clip();
    for (let y = zone.y - 88; y < zone.y + 850; y += 46) {
      const row = top - y;
      if (row < -50 || row > height + 50) continue;
      line(ctx, [[0, row], [width, row]], grid, .65);
      for (let x = 14; x < width; x += 46) {
        ellipse(ctx, x, row, 1.1, 1.1, accent + '80');
      }
    }
    for (let x = 14; x < width; x += 46) {
      line(ctx, [[x, Math.max(-50, offset)], [x, Math.min(height + 50, offset + band)]], grid, .65);
    }

    const base = top - zone.y;
    if (index === 0) {
      ctx.save();
      ctx.translate(65, base - 171);
      ctx.rotate(-.24);
      round(ctx, -49, -69, 98, 138, 13, '#401731', '#ed977b');
      round(ctx, -42, -60, 84, 114, 10, '#a94b62', '#ffc5a0');
      text(ctx, 'Bourbon', 0, -25, '#ffe0b4', 16, 'center');
      text(ctx, 'creams', 0, -6, '#ffe0b4', 16, 'center');
      round(ctx, -17, 8, 34, 31, 6, '#f5b465', '#643330');
      for (let x = -10; x <= 10; x += 10) ellipse(ctx, x, 23, 2, 2, '#8f5038');
      ctx.restore();
      sign(ctx, 'Climb this way ↑', 304, base - 51, 135, '#ffe188', -.11);
      text(ctx, 'No crumbs left behind', 22, base - 390, '#ffbb9c', 16);
    }
    if (index === 1) {
      ctx.save();
      ctx.translate(61, base - 225);
      ctx.rotate(-.16);
      round(ctx, -10, -89, 22, 31, 4, '#fed586', '#1e202f');
      round(ctx, -23, -65, 48, 126, 20, '#563435', '#bc8568');
      round(ctx, -25, -30, 52, 52, 4, '#e2bd76', '#2d252d');
      text(ctx, 'D&B', 1, -7, '#352432', 16, 'center');
      text(ctx, 'Fizzy pop', 1, 10, '#352432', 8, 'center');
      ctx.restore();
      sign(ctx, 'Dandelion and burdock', 251, base - 475, 177, '#b5ed8e', .07);
    }
    if (index === 2) {
      sign(ctx, 'Rail replacement service', 20, base - 189, 182, '#f8bb79', -.065);
      sign(ctx, 'Mind the ridiculous gap', 275, base - 413, 174, '#e9a5cd', .09);
      line(ctx, [[22, base - 42], [110, base - 42], [110, base - 91]], '#ea9054', 4);
      ellipse(ctx, 23, base - 42, 5, 5, '#f4b675');
      ellipse(ctx, 110, base - 92, 5, 5, '#f4b675');
    }
    if (index === 3) {
      ellipse(ctx, 68, base - 388, 32, 32, '#ffc798');
      sign(ctx, 'Chance of biscuit: 100%', 264, base - 134, 174, '#d6e1ff', .07);
    }
    ctx.restore();
  });
}

function ledge(ctx, p, sy, game) {
  const { x, w, kind, checkpoint } = p;
  const y = sy(p.y);
  const edge = '#301b37';
  const slippery = game.effects.slippery > 0;
  if (kind === 'wire') {
    line(ctx, [[x, y + 3], [x + w, y + 3]], edge, 7);
    line(ctx, [[x, y], [x + w, y]], slippery ? '#b2faff' : '#ffe3aa', 3);
    ellipse(ctx, x, y + 1, 4, 4, '#ff8fa4');
    ellipse(ctx, x + w, y + 1, 4, 4, '#ff8fa4');
    return;
  }
  if (kind === 'cloud') {
    const colour = slippery ? '#b2faff' : '#ebecff';
    round(ctx, x, y, w, 15, 7, '#8a8ebd', edge);
    for (let i = 9; i < w - 3; i += 16) ellipse(ctx, x + i, y + 4, 10, 7, colour);
  } else if (kind === 'biscuit' || kind === 'wafer' || kind === 'floor') {
    const cocoa = kind === 'biscuit';
    round(ctx, x, y, w, 21, 5, cocoa ? '#bf7257' : '#e9ac72', edge);
    line(ctx, [[x + 3, y + 11], [x + w - 3, y + 11]], cocoa ? '#6f3945' : '#ffe5a1', 4);
    line(ctx, [[x + 5, y + 3], [x + w - 5, y + 3]], slippery ? '#b2faff' : '#ffd799', 3);
    for (let i = 10; i < w - 5; i += 11) ellipse(ctx, x + i, y + 6, 1.35, 1.35, '#814345');
  } else {
    const fill = { bottle: '#a6db96', crate: '#f4ab6c', moving: '#9ba7ff', wobble: '#f69fb0', flag: '#e3ff83' }[kind];
    round(ctx, x, y, w, 17, kind === 'bottle' ? 8 : 3, fill, edge);
    line(ctx, [[x + 3, y + 3], [x + w - 3, y + 3]], slippery ? '#b2faff' : '#fff1c3', 2);
    if (kind === 'moving') text(ctx, '‹  ›', x + w / 2, y + 13, edge, 11, 'center');
    if (kind === 'wobble') text(ctx, '≈', x + w / 2, y + 13, edge, 12, 'center');
    if (kind === 'bottle') {
      round(ctx, x + w * .36, y + 4, w * .35, 10, 2, '#ffcd86');
      line(ctx, [[x + w - 9, y + 1], [x + w - 9, y + 16]], edge, 3);
    }
  }
  if (checkpoint && p.zone) {
    line(ctx, [[x + 7, y], [x + 7, y - 24]], '#ffefbd', 2);
    round(ctx, x + 7, y - 26, 50, 15, 2, game.checkpoint.zone >= p.zone ? '#e3ff83' : '#ffd58b', edge);
    text(ctx, 'Checkpoint', x + 32, y - 16, edge, 7, 'center');
  }
}

function drawFlag(ctx, x, y, time) {
  line(ctx, [[x, y], [x, y - 52]], '#fff6cc', 3);
  for (let i = 0; i < 5; i++) {
    const wave = Math.sin(time * 4 - i / 2) * i * .7;
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#3a2549' : '#e9ff8b';
      ctx.fillRect(x + i * 7 + 1, y - 52 + j * 7 + wave, 7, 7);
    }
  }
  ellipse(ctx, x, y - 53, 3, 3, '#ffcc69');
}

function drawPlayer(ctx, game, y, w, h) {
  const { player, effects } = game;
  const x = player.x - w / 2;
  const face = player.vx < -8 ? -1 : 1;
  if (effects.float > 0 || effects.boost > 0) {
    ctx.globalAlpha = .42;
    ellipse(ctx, player.x, y - h / 2, w * .77, h * .79, effects.float > 0 ? '#e6b9ff' : '#eaff69');
    ctx.globalAlpha = 1;
  }
  const stride = player.grounded && Math.abs(player.vx) > 20 ? Math.sin(game.time * 29) * 2 : 0;
  round(ctx, x + 2, y - 8 + stride, 9, 8, 3, '#29162d');
  round(ctx, x + w - 11, y - 8 - stride, 9, 8, 3, '#29162d');
  round(ctx, x, y - h, w, h - 5, 7, '#ffbd77', '#29162d');
  round(ctx, x + 3, y - h + 3, w - 6, h - 11, 5, '#ffdc9a', '#c67b54');
  ellipse(ctx, player.x + face * 7, y - 15, 2, 3, '#30182d');
  ellipse(ctx, player.x + face, y - 15, 2, 3, '#30182d');
  line(ctx, [[x + 5, y - 9], [x + w - 4, y - 9]], '#ad624e', 2);
  round(ctx, x - 2, y - h - 2, w + 4, 7, 3, '#ecff87', '#29162d');
  round(ctx, x + 6, y - h - 8, w - 11, 9, 3, '#ecff87', '#29162d');
}

function drawDragon(ctx, dragon, y, width, time) {
  if (dragon.phase === 'warning') {
    line(ctx, [[0, y], [width, y]], '#ffbc82', 2);
    text(ctx, 'Dragon incoming: jump', width / 2, y - 12, '#fff0cf', 15, 'center');
    return;
  }
  ctx.save();
  ctx.translate(dragon.x, y);
  ctx.scale(dragon.direction, 1);
  const flap = Math.sin(time * 24) * 9;
  ctx.beginPath();
  ctx.moveTo(7, -5);
  ctx.lineTo(-29, -38 + flap);
  ctx.lineTo(-49, -13 + flap);
  ctx.lineTo(-32, -15 + flap);
  ctx.lineTo(-34, 2);
  ctx.closePath();
  ctx.fillStyle = '#e36587';
  ctx.fill();
  ellipse(ctx, 0, 0, 32, 13, '#a8ed68');
  ellipse(ctx, 27, -8, 16, 13, '#dbff8a');
  ellipse(ctx, 36, -10, 2, 3, '#271831');
  line(ctx, [[-21, 2], [-44, 7], [-66, -8]], '#a8ed68', 6);
  line(ctx, [[30, -18], [25, -26]], '#feda88', 4);
  ctx.restore();
}

export function drawWorld(ctx, view, game, world) {
  const { width, platforms, zones, goal, platformPosition, playerWidth, playerHeight } = world;
  const { height, scale, bottom, rotation } = view;
  if (!Number.isFinite(height) || scale <= 0) return;
  const sy = (y) => bottom + height - y;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#21182d';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rotation);
  ctx.translate(-width / 2, -height / 2);
  backdrop(ctx, view, zones, width);
  for (const p of platforms) {
    if (sy(p.y) < -60 || sy(p.y) > height + 60) continue;
    ledge(ctx, platformPosition(p, game.time), sy, game);
  }
  if (sy(goal.y) < height + 60) drawFlag(ctx, goal.x, sy(goal.y), game.time);
  drawPlayer(ctx, game, sy(game.player.y), playerWidth, playerHeight);
  if (game.dragon) drawDragon(ctx, game.dragon, sy(game.dragon.y), width, game.time);
  ctx.restore();
}
