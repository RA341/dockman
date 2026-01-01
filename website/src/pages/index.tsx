import {ReactNode, useState} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import IconCopy from "@theme/Icon/Copy";
import IconSuccess from "@theme/Icon/Success";

import styles from './index.module.css';
import Head from "@docusaurus/Head";

function HomepageHeader() {
    const demoCommand = "docker run --rm -p 8866:8866 -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/ra341/dockman:latest"
    const [isLoading, setIsLoading] = useState(true);

    return (
        <header className={clsx('hero', styles.heroBanner)}>
            <div className="container">
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    marginBottom: '1rem'
                }}>
                    <img src="img/dockman.svg" alt="Dockman Logo" width="80" height="80"/>
                    <Heading as="h1" className="hero__title" style={{margin: 0}}>
                        Dockman
                    </Heading>
                </div>
                <p className="hero__subtitle" style={{fontSize: '1.1rem'}}>
                    A Docker management tool for users who want unfiltered access to their
                    Docker Compose files.
                </p>

                <div style={{
                    maxWidth: '1000px',
                    margin: '0 auto 2rem',
                    position: 'relative',
                    paddingBottom: '45%',
                    height: 0,
                    overflow: 'hidden',
                    borderRadius: '8px'
                }}>
                    {isLoading && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--ifm-color-emphasis-200)',
                            color: 'var(--ifm-color-emphasis-700)'
                        }}>
                            Fetching demo video...
                        </div>
                    )}
                    <video
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                        }}
                        autoPlay
                        loop
                        muted
                        playsInline
                        onLoadStart={() => setIsLoading(true)}
                        onCanPlay={() => setIsLoading(false)}
                    >
                        <source src="https://github.com/RA341/assets/releases/download/dockman/dockman-demo.mp4"
                                type="video/mp4"/>
                        Your browser does not support the video tag. This is a demo of Dockman.
                    </video>
                </div>

                <CopyableCommand command={demoCommand}/>

                <div className={styles.buttons}>
                    <Link
                        className="button button--secondary button--lg"
                        to="/docs/install/docker">
                        RTFM 📚
                    </Link>
                </div>
            </div>
        </header>
    );
}

function CopyableCommand({command}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <div className={styles.outerContainer}>
            <div className={styles.tryNowContainer}>
                <span className={styles.tryNowText}>Try Now</span>
            </div>
            <div className={styles.commandWrapper}>
                <span className={styles.commandText}>{command}</span>
                <button
                    className={clsx(styles.copyButton, 'clean-btn')}
                    onClick={handleCopy}
                    aria-label="Copy command to clipboard">
                    {copied ? <IconSuccess className={styles.iconSuccess}/> : <IconCopy className={styles.iconCopy}/>}
                </button>
            </div>
        </div>
    );
}

export default function Home(): ReactNode {
    return (
        <Layout
            title="Dockman - Docker Management Tool"
            description="Yet another Docker Compose manager">
            <HomepageHeader/>
            <Head>
                <meta name="algolia-site-verification" content="51EE8E6D0FBDD71C"/>
            </Head>
            <main>
                <HomepageFeatures/>
            </main>
        </Layout>
    );
}