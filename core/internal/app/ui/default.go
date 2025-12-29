package ui

import "net/http"

func NewDefaultUIHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(noUIContent))
	}
}

const noUIContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dockman - Web UI Not Found</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #e2e8f0;
            line-height: 1.6;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        
        .container {
            text-align: center;
            max-width: 600px;
            padding: 3rem 2rem;
            background: rgba(30, 41, 59, 0.6);
            border-radius: 16px;
            border: 1px solid rgba(148, 163, 184, 0.1);
            backdrop-filter: blur(10px);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        
        .icon {
            margin-bottom: 1.5rem;
            opacity: 0.9;
        }
        
        .icon img {
            width: 80px;
            height: 80px;
            object-fit: contain;
            border-radius: 8px;
        }
        
        .brand {
            font-size: 1.25rem;
            font-weight: 600;
            color: #3b82f6;
            margin-bottom: 0.5rem;
        }
        
        h1 {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #f8fafc;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .subtitle {
            color: #94a3b8;
            margin-bottom: 2rem;
            font-size: 1.1rem;
        }
        
        .troubleshooting {
            background: rgba(15, 23, 42, 0.6);
            border-radius: 12px;
            padding: 2rem;
            margin: 2rem 0;
            border: 1px solid rgba(148, 163, 184, 0.1);
            text-align: left;
        }
        
        .troubleshooting h3 {
            color: #f1f5f9;
            margin-bottom: 1rem;
            font-size: 1.2rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .troubleshooting h3:before {
            content: "🔧";
            font-size: 1.1rem;
        }
        
        .troubleshooting ul {
            list-style: none;
            padding: 0;
        }
        
        .troubleshooting li {
            padding: 0.75rem 0;
            border-bottom: 1px solid rgba(148, 163, 184, 0.1);
            position: relative;
            padding-left: 1.5rem;
        }
        
        .troubleshooting li:last-child {
            border-bottom: none;
        }
        
        .troubleshooting li:before {
            content: "→";
            position: absolute;
            left: 0;
            color: #3b82f6;
            font-weight: bold;
        }
        
        .troubleshooting strong {
            color: #60a5fa;
            font-weight: 600;
        }
        
        .actions {
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
            margin-top: 2rem;
        }
        
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            color: #f8fafc;
            text-decoration: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            transition: all 0.2s ease;
            font-size: 0.95rem;
            font-weight: 500;
            border: 1px solid;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            border-color: #1d4ed8;
        }
        
        .btn-primary:hover {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            transform: translateY(-1px);
            box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.3);
        }
        
        .btn-secondary {
            background: rgba(30, 41, 59, 0.8);
            border-color: #475569;
        }
        
        .btn-secondary:hover {
            background: rgba(51, 65, 85, 0.9);
            border-color: #64748b;
        }
        
        .api-info {
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 8px;
            padding: 1rem;
            margin: 1.5rem 0;
            color: #6ee7b7;
        }
        
        .api-info strong {
            color: #10b981;
        }
        
        .version-info {
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid rgba(148, 163, 184, 0.1);
            color: #64748b;
            font-size: 0.9rem;
        }
        
        @media (max-width: 640px) {
            .container {
                padding: 2rem 1rem;
                margin: 1rem;
            }
            
            h1 {
                font-size: 1.5rem;
            }
            
            .actions {
                flex-direction: column;
                align-items: stretch;
            }
            
            .btn {
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
		<img 
		  src="https://media.tenor.com/U3QqFdI8svYAAAAM/pulp-fiction-confused.gif" 
		  alt="Dockman Loading" 
		  style="width: 300px; height: auto;"
		  onerror="this.style.display='none'; this.parentNode.innerHTML='🐳';"> 
		</div>
        <div class="brand">DOCKMAN</div>
        <h1>Web UI Not Available</h1>
        <p class="subtitle">The web interface files could not be located or loaded.</p>
        
        <div class="api-info">
            <strong>Good news:</strong> The Dockman API server is running and accessible! Only the web UI is missing.
        </div>
        
        <div class="troubleshooting">
            <h3>Troubleshooting Steps</h3>
            <ul>
                <li>
                    <strong>For Developers:</strong> This is expected during development. The integrated web UI is disabled in development mode. Start the development server in the <code>ui</code> directory to access the web interface.
                </li>
                <li>
                    <strong>For Users:</strong> Verify your UI path configuration in the Dockman config. The web UI files may not be properly installed or the path may be incorrect.
                </li>
            </ul>
        </div>
        
        <div class="actions">
            <a href="https://github.com/RA341/dockman/issues" class="btn btn-primary" target="_blank">
                🐛 Report Issue
            </a>
            <a href="https://github.com/RA341/dockman" class="btn btn-secondary" target="_blank">
                📚 Documentation
            </a>
        </div>
        
        <div class="version-info">
            <p>Dockman Server • Running without Web UI</p>
            <p>For API access, use the base URL of this server</p>
        </div>
    </div>
</body>
</html>`
