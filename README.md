# Skybreak

Skybreak is a solo third-person 3D climb from a quarry above the clouds to a summit flag. Run across cargo platforms, gather your footing on narrow gantries and jump between lifts. Falling costs height and carries no damage. Touch the summit flag to finish.

## Play the game

[Play Skybreak in your browser](https://samuel-morgan-tyghe.github.io/biscuit-rising/).

- Move with **WASD** or the **arrow keys**, relative to the camera. Jump with **Space**. Drag on the game or use **Q / E** to orbit, and press **R** to face the route. Touch screens have on-screen movement and jump controls.
- Aim for the mint marker on the next ledge. Use your shadow to judge how far forward or back you need to move. The game requires WebGL 2.
- Try the gift simulator to see what every effect does. You can practise the climb and simulate gifts before opening TikFinity.

## Connect your TikTok LIVE

1. Install and open the **TikFinity Desktop App for Windows** on the PC running the game. Complete [TikFinity Setup](https://tikfinity.com/app/setup) and connect your own TikTok account there. Start your TikTok LIVE and connect TikFinity to that stream.
2. Open Skybreak in your browser on the same computer. Use the game's TikFinity connection button. If the browser asks for local network access, allow it for the game. A connected status confirms that the game can reach the desktop app. Check separately that your LIVE is connected inside TikFinity.
3. In the game’s gift settings, enter the gift names available in your LIVE and choose an effect for each. The names are matched without regard to case. Gifts with no matching entry are ignored.
4. Use the in-game simulator to rehearse the effects without spending coins. Then check that a gift received on your LIVE appears in the game and triggers its mapped effect. A gift streak applies its effect when the streak ends.
5. Capture the game browser window in OBS or TikTok LIVE Studio. Keep the game focused while you play.

The game connects to TikFinity’s local [Event API](https://tikfinity.zerody.one/tiktok/dapi) at `ws://localhost:21213/`. The [Windows app](https://blog.tikfinity.com/tikfinity-setup/) provides this connection. You can play or simulate gifts in your browser on other systems. Sign in through TikFinity. The game has no TikTok sign-in and takes no credentials.

## If the published page cannot connect

Some browsers restrict connections from a public page to a local WebSocket. Run the game locally on the same computer as TikFinity to avoid that restriction.

1. On [GitHub](https://github.com/Samuel-Morgan-Tyghe/biscuit-rising), select **Code → Download ZIP** and extract the archive.
2. On Windows with [Python 3](https://www.python.org/downloads/) installed, double-click `play-local.cmd` inside the extracted folder. To run the local practice edition on macOS or Linux, open a terminal in the extracted folder and run `python3 -m http.server 8000 --bind 127.0.0.1`.
3. Open `http://127.0.0.1:8000/` in your browser. Leave the server window open while you play, and connect to TikFinity from this local copy. Use **Ctrl+C** in the server window to stop it when finished.

Gift settings saved on the published page belong to that browser origin. Enter them again on the local page.

## Visual assets

The local asset pack includes an animated KayKit climber, Kenney factory and nature models, and a custom panorama of the cloudline. See the [model credits and licences](assets/README.md) and the [panorama prompt](assets/skybreak-matte.md).

## Run the checks

With Node.js installed, run `node --test` from the project folder. The game serves static files and needs no JavaScript package installation. The [Three.js r187](https://github.com/mrdoob/three.js/releases/tag/r187) runtime is bundled in `vendor/` under the [MIT licence](vendor/LICENSE.three.txt), so the local game can load without an internet connection. To rebuild the bundle, pack `three@0.187.0` with npm, extract it, and run `npx esbuild@0.25.0 package/build/three.module.js --bundle --format=esm --minify --legal-comments=inline --outfile=vendor/three.module.min.js`.
