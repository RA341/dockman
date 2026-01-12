const {app, BrowserWindow} = require('electron');

async function createWindow() {
    const isDev = process.env.NODE_ENV === 'development';
    let url = "http://localhost:5173"; // vite url
    if (!isDev) {
        url = 'http://localhost:8866';
    }

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: `${url}/dockman.svg`,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });


    await win.loadURL(url);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});