import React, {useState} from 'react';
import {Check, Copy} from 'lucide-react';

export default function DockerComposeGenerator() {
    const [stacksPath, setStacksPath] = useState('/home/zaphodb/stacks');
    const [configPath, setConfigPath] = useState('/home/zaphodb/config/dockman');
    const [copied, setCopied] = useState(false);

    const generateCompose = () => {
        return `services:
  dockman:
    container_name: dockman
    image: ghcr.io/ra341/dockman:latest
    environment:
      # 1️⃣
      - DOCKMAN_COMPOSE_ROOT=${stacksPath}
    volumes:
      #  2️⃣              3️⃣                
      - ${stacksPath}:${stacksPath}
      - ${configPath}:/config
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8866:8866"
    restart: always`;
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(generateCompose());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{
            margin: '1.5rem 0',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--ifm-background-surface-color)',
        }}>
            <div style={{
                fontWeight: 'bold',
                backgroundColor: 'var(--ifm-color-emphasis-100)',
                padding: '1.5rem',
                borderBottom: '1px solid var(--ifm-color-emphasis-300)',
            }}>
                <h3 style={{
                    // MODIFIED: Increased font size and font weight for title
                    fontSize: '1.5rem',
                    fontWeight: '900',
                    marginBottom: '1.25rem',
                    marginTop: 0,
                    color: 'var(--ifm-heading-color)',
                }}>
                    Generate your config (PATHS MUST BE ABSOLUTE)
                </h3>

                <div style={{marginBottom: '1rem'}}>
                    <label style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: 'var(--ifm-color-content)',
                        marginBottom: '0.5rem',
                    }}>
                        Stacks Directory
                    </label>
                    <input
                        type="text"
                        value={stacksPath}
                        onChange={(e) => setStacksPath(e.target.value)}
                        placeholder="/path/to/stacks"
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.85rem',
                            border: '2px solid var(--ifm-color-emphasis-300)',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            boxSizing: 'border-box',
                            backgroundColor: 'var(--ifm-background-color)',
                            color: 'var(--ifm-font-color-base)',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--ifm-color-primary)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--ifm-color-emphasis-300)'}
                    />
                </div>

                <div style={{marginBottom: '0'}}>
                    <label style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: 'var(--ifm-color-content)',
                        marginBottom: '0.5rem',
                    }}>
                        Config Directory
                    </label>
                    <input
                        type="text"
                        value={configPath}
                        onChange={(e) => setConfigPath(e.target.value)}
                        placeholder="/path/to/dockman/config"
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.85rem',
                            border: '2px solid var(--ifm-color-emphasis-300)',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            boxSizing: 'border-box',
                            backgroundColor: 'var(--ifm-background-color)',
                            color: 'var(--ifm-font-color-base)',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--ifm-color-primary)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--ifm-color-emphasis-300)'}
                    />
                </div>
            </div>

            <div style={{position: 'relative'}}>
                <button
                    onClick={handleCopy}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--ifm-color-primary-dark)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--ifm-color-primary)'}
                    style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.375rem 0.75rem',
                        backgroundColor: 'var(--ifm-color-primary-darkest)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        zIndex: 10,
                        fontWeight: '500',
                    }}
                >
                    {copied ? (
                        <>
                            <Check size={16}/>
                            Copied!
                        </>
                    ) : (
                        <>
                            <Copy size={16}/>
                            Copy
                        </>
                    )}
                </button>

                <pre style={{
                    backgroundColor: 'var(--docusaurus-highlighted-code-line-bg)',
                    color: 'var(--ifm-code-color)',
                    padding: '1rem',
                    margin: 0,
                    overflowX: 'auto',
                    fontSize: 'var(--ifm-code-font-size)',
                    lineHeight: '1.5',
                }}>
                      <code style={{fontFamily: 'var(--ifm-font-family-monospace)'}}>
                        {generateCompose()}
                      </code>
                </pre>
            </div>
        </div>
    );
}