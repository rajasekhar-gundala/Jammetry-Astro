import React, { useState } from 'react';

export default function DocsManager({ tenantId, initialConfig, isPro }) {
    const [files, setFiles] = useState([]);
    const [uploadMode, setUploadMode] = useState('folder'); // 'folder' or 'files'
    
    const [config, setConfig] = useState(initialConfig || {
        title: 'My Docs',
        primaryColor: '#111827',
        customDomain: '',
        footerText: 'Build production-ready documentation in seconds.',
        footerLinks: [
            {
                title: 'Resources',
                items: [
                    { label: 'Getting Started', href: '/getting-started/quick-start' },
                    { label: 'Configuration', href: '/configuration' }
                ]
            },
            {
                title: 'Community',
                items: [
                    { label: 'GitHub', href: 'https://github.com' },
                    { label: 'Discord', href: 'https://discord.com' }
                ]
            }
        ]
    });
    
    const [status, setStatus] = useState('idle'); 
    const [message, setMessage] = useState('');

    const handleFileChange = (e) => {
        setFiles(Array.from(e.target.files));
    };

    const updateColumnTitle = (colIndex, value) => {
        const newLinks = [...config.footerLinks];
        newLinks[colIndex].title = value;
        setConfig({ ...config, footerLinks: newLinks });
    };

    const removeColumn = (colIndex) => {
        const newLinks = [...config.footerLinks];
        newLinks.splice(colIndex, 1);
        setConfig({ ...config, footerLinks: newLinks });
    };

    const addColumn = () => {
        setConfig({
            ...config,
            footerLinks: [...config.footerLinks, { title: 'New Category', items: [] }]
        });
    };

    const updateLink = (colIndex, itemIndex, field, value) => {
        const newLinks = [...config.footerLinks];
        newLinks[colIndex].items[itemIndex][field] = value;
        setConfig({ ...config, footerLinks: newLinks });
    };

    const removeLink = (colIndex, itemIndex) => {
        const newLinks = [...config.footerLinks];
        newLinks[colIndex].items.splice(itemIndex, 1);
        setConfig({ ...config, footerLinks: newLinks });
    };

    const addLink = (colIndex) => {
        const newLinks = [...config.footerLinks];
        newLinks[colIndex].items.push({ label: 'New Link', href: '#' });
        setConfig({ ...config, footerLinks: newLinks });
    };

    const handleDeploy = async () => {
        if (files.length === 0) {
            setMessage(uploadMode === 'folder' 
                ? "Please select a folder containing Markdown files." 
                : "Please select at least one file."
            );
            return;
        }

        setStatus('uploading');
        setMessage(uploadMode === 'folder' ? 'Uploading folder structure...' : 'Uploading files...');

        try {
            const formData = new FormData();
            files.forEach(file => {
                const filePath = file.webkitRelativePath || file.name;
                const encodedPath = filePath.replace(/\//g, '@@@');
                formData.append('files', file, encodedPath);
            });

            const uploadRes = await fetch(`https://api.rajasekhar.digital/api/daas/upload/${tenantId}`, {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) throw new Error("Upload failed");

            setStatus('building');
            setMessage('Building site and training AI...');

            const buildRes = await fetch(`https://api.rajasekhar.digital/api/daas/build/${tenantId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config })
            });

            if (!buildRes.ok) throw new Error("Build failed");

            if (config.customDomain && isPro) {
                await fetch(`https://api.rajasekhar.digital/api/daas/custom-domain`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tenantId, customDomain: config.customDomain })
                });
            }

            setStatus('success');
            setMessage('Deploy complete! Your docs and AI are live.');
            
        } catch (error) {
            console.error(error);
            setStatus('error');
            setMessage(error.message || 'An error occurred during deployment.');
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            
            {/* 👇 FIXED: Replaced the <form> with a clean <a> link to the pricing page! */}
            {!isPro && (
                <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg">Unlock Professional Features</h3>
                        <p className="text-gray-600 text-sm mt-1">Upgrade to Pro to enable custom domains and lift upload limitations.</p>
                    </div>
                    <div className="shrink-0 w-full md:w-auto">
                        <a 
                            href="/pricing?upgrade=daas&reason=locked" 
                            className="inline-flex justify-center w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md shadow-sm transition-colors text-sm"
                        >
                            Upgrade to Pro
                        </a>
                    </div>
                </div>
            )}

            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">Documentation Settings</h2>
                
                <div className="space-y-4 mb-8">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Site Title</label>
                        <input 
                            type="text" 
                            value={config.title}
                            onChange={(e) => setConfig({...config, title: e.target.value})}
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Brand Color</label>
                        <div className="flex items-center gap-3">
                            <input 
                                type="color" 
                                value={config.primaryColor}
                                onChange={(e) => setConfig({...config, primaryColor: e.target.value})}
                                className="h-10 w-10 rounded border-gray-300 cursor-pointer"
                            />
                            <span className="text-sm text-gray-500 font-mono">{config.primaryColor}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
                            Custom Domain (Optional)
                            {!isPro && <span className="text-xs text-blue-600 font-bold uppercase tracking-wider">Pro Feature</span>}
                        </label>
                        <div className={`flex rounded-md shadow-sm ${!isPro ? 'opacity-60' : ''}`}>
                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                https://
                            </span>
                            <input 
                                type="text" 
                                placeholder={isPro ? "docs.yourcompany.com" : "Upgrade to unlock custom domains"}
                                value={config.customDomain}
                                onChange={(e) => setConfig({...config, customDomain: e.target.value})}
                                disabled={!isPro}
                                className={`flex-1 block w-full rounded-none rounded-r-md sm:text-sm border-gray-300 border p-2 ${!isPro ? 'bg-gray-100 cursor-not-allowed text-gray-400' : ''}`}
                            />
                        </div>
                        {isPro && <p className="text-xs text-gray-500 mt-1">Point a CNAME record to docs.rajasekhar.digital</p>}
                    </div>
                </div>

                <hr className="my-6 border-gray-200" />

                <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-bold text-gray-800">Footer Settings</h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Footer Tagline</label>
                        <textarea 
                            value={config.footerText}
                            onChange={(e) => setConfig({...config, footerText: e.target.value})}
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                            rows="2"
                            placeholder="Tagline under your logo..."
                        />
                    </div>

                    <div className="space-y-4 mt-4">
                        <label className="block text-sm font-medium text-gray-700">Footer Columns</label>
                        {config.footerLinks.map((column, colIndex) => (
                            <div key={colIndex} className="p-4 border border-gray-200 rounded-md bg-gray-50 relative">
                                <div className="flex justify-between items-center mb-3">
                                    <input 
                                        type="text" 
                                        value={column.title}
                                        onChange={(e) => updateColumnTitle(colIndex, e.target.value)}
                                        className="font-semibold text-gray-700 bg-transparent border-b border-gray-300 focus:outline-none focus:border-blue-500 pb-1"
                                        placeholder="Column Title"
                                    />
                                    <button 
                                        onClick={() => removeColumn(colIndex)}
                                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                                    >
                                        Remove Column
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {column.items.map((link, itemIndex) => (
                                        <div key={itemIndex} className="flex gap-2 items-center">
                                            <input 
                                                type="text" 
                                                value={link.label}
                                                onChange={(e) => updateLink(colIndex, itemIndex, 'label', e.target.value)}
                                                className="flex-1 text-sm border-gray-300 rounded-md border p-1.5"
                                                placeholder="Link Label"
                                            />
                                            <input 
                                                type="text" 
                                                value={link.href}
                                                onChange={(e) => updateLink(colIndex, itemIndex, 'href', e.target.value)}
                                                className="flex-1 text-sm border-gray-300 rounded-md border p-1.5"
                                                placeholder="URL (e.g., /about or https://)"
                                            />
                                            <button 
                                                onClick={() => removeLink(colIndex, itemIndex)}
                                                className="text-gray-400 hover:text-red-500 px-2"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                
                                <button 
                                    onClick={() => addLink(colIndex)}
                                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    + Add Link
                                </button>
                            </div>
                        ))}
                        
                        <button 
                            onClick={addColumn}
                            className="w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-md hover:border-blue-500 hover:text-blue-600 transition-colors text-sm font-medium"
                        >
                            + Add New Footer Column
                        </button>
                    </div>
                </div>

                <hr className="my-6 border-gray-200" />

                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-sm font-medium text-gray-700">Source Documentation</label>
                            
                            <div className="flex bg-gray-100 p-1 rounded-md">
                                <button
                                    type="button"
                                    onClick={() => { setUploadMode('folder'); setFiles([]); }}
                                    className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${uploadMode === 'folder' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Folder
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setUploadMode('files'); setFiles([]); }}
                                    className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${uploadMode === 'files' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Individual Files
                                </button>
                            </div>
                        </div>

                        <input 
                            key={uploadMode}
                            type="file" 
                            webkitdirectory={uploadMode === 'folder' ? "true" : undefined}
                            directory={uploadMode === 'folder' ? "true" : undefined}
                            multiple 
                            accept={uploadMode === 'files' ? ".md,.mdx,.json,.png,.jpg,.webp" : undefined}
                            onChange={handleFileChange}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {files.length} {uploadMode === 'folder' ? 'file(s) found in folder' : 'file(s) selected'}
                        </p>
                    </div>

                    <button 
                        onClick={handleDeploy}
                        disabled={status === 'uploading' || status === 'building'}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50 flex justify-center items-center"
                    >
                        {status === 'uploading' || status === 'building' ? (
                            <span className="animate-pulse">{message}</span>
                        ) : 'Upload & Deploy Docs'}
                    </button>

                    {message && status !== 'uploading' && status !== 'building' && (
                        <div className={`p-3 rounded-md text-sm ${status === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                            {message}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}