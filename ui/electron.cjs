const {app, BrowserWindow} = require('electron');

async function createWindow() {
    const isDev = process.env.NODE_ENV === 'development';
    let url = 'http://localhost:5173';
    if (!isDev) {
        const customPort = app.commandLine.getSwitchValue('port') || 9966;
        console.log(`Electron is using port: ${customPort}`);
        url = `http://localhost:${customPort}`;
    }

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: `${url}/dockman.png`,
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