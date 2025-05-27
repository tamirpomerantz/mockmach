import ImageTransformer from './ImageTransformer.js';
import MockupDetector from './MockupDetector.js';
import MockupAnimator from './MockupAnimator.js';

class MockupEditor {
    constructor() {
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.backgroundImage = null;
        this.screenLayers = []; // Array of {image, cornerPoints, blendMode}
        this.selectedPoint = null;
        this.selectedLayer = null;
        this.isDragging = false;
        this.lastMousePos = null;
        this.mockupPaths = [];
        this.imageTransformer = new ImageTransformer(this.ctx);
        this.mockupDetector = new MockupDetector();

        // Set initial canvas size
        this.canvas.width = 1000;
        this.canvas.height = 800;

        // Load mockups and setup event listeners
        this.loadMockupGallery();
        this.setupEventListeners();
    }

    loadMockupGallery() {
        // List of all mockup files
        this.mockupPaths = [
            'mockups/visualelectric-1748261259770.png',
            'mockups/visualelectric-1748261266492.png',
            'mockups/visualelectric-1748261276540.png',
            'mockups/visualelectric-1748261295616.png',
            'mockups/visualelectric-1748261304335.png',
            'mockups/visualelectric-1748261318253.png',
            'mockups/visualelectric-1748261328063.png',
            'mockups/visualelectric-1748261339097.png',
            'mockups/visualelectric-1748261346321.png',
            'mockups/visualelectric-1748261360450.png',
            'mockups/visualelectric-1748261384867.png',
            'mockups/visualelectric-1748261422033.png',
            'mockups/visualelectric-1748261433395.png',
            'mockups/visualelectric-1748261447102.png',
            'mockups/visualelectric-1748261456859.png',
            'mockups/visualelectric-1748261461437.png',
            'mockups/visualelectric-1748261468448.png',
            'mockups/visualelectric-1748261504179.png',
            'mockups/visualelectric-1748261509897.png',
            'mockups/visualelectric-1748261516935.png',
            'mockups/visualelectric-1748261524835.png',
            'mockups/visualelectric-1748261537147.png',
            'mockups/visualelectric-1748261544027.png',
            'mockups/visualelectric-1748261549724.png',
            'mockups/visualelectric-1748261554937.png',
            'mockups/visualelectric-1748261564086.png'
        ];

        const gallery = document.getElementById('mockupGallery');
        
        this.mockupPaths.forEach((path, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'mockup-thumbnail';
            
            const img = document.createElement('img');
            img.src = path;
            img.alt = `Mockup ${index + 1}`;
            
            thumbnail.appendChild(img);
            gallery.appendChild(thumbnail);

            // Add click handler
            thumbnail.addEventListener('click', () => {
                // Remove selected class from all thumbnails
                document.querySelectorAll('.mockup-thumbnail').forEach(thumb => {
                    thumb.classList.remove('selected');
                });
                
                // Add selected class to clicked thumbnail
                thumbnail.classList.add('selected');
                
                // Load the background image
                this.loadBackgroundImage(path);
            });
        });

        // Load the first mockup by default
        if (this.mockupPaths.length > 0) {
            this.loadBackgroundImage(this.mockupPaths[0]);
            gallery.firstElementChild?.classList.add('selected');
        }
    }

    async loadBackgroundImage(src) {
        const img = new Image();
        await new Promise(resolve => {
            img.onload = resolve;
            img.src = src;
        });

        // Store current blend mode
        const currentBlendMode = this.ctx.globalCompositeOperation;
        
        this.backgroundImage = img;
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        
        // Reapply blend mode before rendering
        this.ctx.globalCompositeOperation = currentBlendMode;
        this.render();
    }

    setupEventListeners() {
        // Add Image button handler
        document.getElementById('addImageButton').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => this.loadScreenImage(e);
            input.click();
        });

        // Magic Fit button handler
        document.getElementById('magicFitButton').addEventListener('click', async () => {
            if (!this.backgroundImage) {
                // Show error feedback if no background image
                const message = document.createElement('div');
                message.className = 'error-message';
                message.textContent = 'Please select a background mockup first';
                document.body.appendChild(message);
                setTimeout(() => message.remove(), 3000);
                return;
            }

            if (this.selectedLayer === null || !this.screenLayers[this.selectedLayer]) {
                // Show error feedback if no image is selected
                const message = document.createElement('div');
                message.className = 'error-message';
                message.textContent = 'Please add and select a screen image first';
                document.body.appendChild(message);
                setTimeout(() => message.remove(), 3000);
                return;
            }

            const magicButton = document.getElementById('magicFitButton');
            
            try {
                // Enable debug mode temporarily
                this.mockupDetector.debugMode = true;

                // Set current corners from the selected layer
                const currentLayer = this.screenLayers[this.selectedLayer];
                this.mockupDetector.setCurrentCorners(currentLayer.cornerPoints);

                const mockupCorners = await this.mockupDetector.detectMockupArea(this.backgroundImage);
                
                // If detection succeeded, animate to the detected area
                await this.animateToMockupArea(currentLayer, mockupCorners);
                
                // Visual feedback for success
                magicButton.classList.add('success');
                setTimeout(() => magicButton.classList.remove('success'), 1000);
            } catch (error) {
                console.warn('Could not detect mockup area:', error);
                
                // Show error message to user
                const message = document.createElement('div');
                message.className = 'error-message';
                message.textContent = 'Could not detect mockup area. Try adjusting the image contrast or selecting a different mockup.';
                document.body.appendChild(message);
                setTimeout(() => message.remove(), 3000);
                
                // Visual feedback for failure
                magicButton.classList.add('error');
                setTimeout(() => magicButton.classList.remove('error'), 1000);
            } finally {
                // Disable debug mode
                this.mockupDetector.debugMode = false;
            }
        });

        // Blend mode options handler
        document.querySelectorAll('.blend-mode-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                // Update active state in UI
                document.querySelectorAll('.blend-mode-option').forEach(opt => {
                    opt.classList.remove('active');
                });
                e.target.classList.add('active');
                
                // Apply blend mode
                if (this.selectedLayer !== null) {
                    // If a layer is selected, only change that layer's blend mode
                    this.screenLayers[this.selectedLayer].blendMode = mode;
                } else {
                    // If no layer is selected, change all layers' blend modes
                    this.screenLayers.forEach(layer => {
                        layer.blendMode = mode;
                    });
                }
                this.render();
            });
        });

        // Set initial active state for Normal blend mode
        document.querySelector('.blend-mode-option[data-mode="source-over"]').classList.add('active');

        // Canvas interaction handlers
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());

        // Download and Copy handlers
        document.getElementById('downloadButton').addEventListener('click', () => this.downloadImage());
        document.getElementById('copyButton').addEventListener('click', () => this.copyToClipboard());

        // Paste handler (for the entire document)
        document.addEventListener('paste', (e) => this.handlePaste(e));

        // Drag and drop handlers
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.add('dragging');
        });

        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('dragging');
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('dragging');
            this.handleDrop(e);
        });

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedLayer !== null) {
                this.screenLayers.splice(this.selectedLayer, 1);
                this.selectedLayer = null;
                this.selectedPoint = null;
                this.render();
            }
        });
    }

    handlePaste(e) {
        // Check if we have image data in clipboard
        const items = e.clipboardData?.items;
        if (!items) return;

        // Look for image content
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                // Get the blob and treat it as a screen image
                const blob = items[i].getAsFile();
                this.processScreenImageFile(blob);
                break;
            }
        }
    }

    handleDrop(e) {
        const items = e.dataTransfer?.items || e.dataTransfer?.files;
        if (!items) return;

        // Handle both DataTransferItemList and FileList
        if (items instanceof DataTransferItemList) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    this.processScreenImageFile(file);
                    break;
                }
            }
        } else {
            // Handle FileList
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    this.processScreenImageFile(items[i]);
                    break;
                }
            }
        }
    }

    async processScreenImageFile(file) {
        if (!file) return;
        
        const reader = new FileReader();
        await new Promise(resolve => {
            reader.onload = async (e) => {
                const img = new Image();
                await new Promise(imgResolve => {
                    img.onload = imgResolve;
                    img.src = e.target.result;
                });

                const newLayer = {
                    image: img,
                    cornerPoints: this.imageTransformer.calculateInitialCornerPoints(img, this.canvas),
                    blendMode: 'source-over'
                };
                this.screenLayers.push(newLayer);
                this.selectedLayer = this.screenLayers.length - 1;
                this.render();
                resolve();
            };
            reader.readAsDataURL(file);
        });
    }

    loadScreenImage(event) {
        const file = event.target.files[0];
        if (file) {
            this.processScreenImageFile(file);
        }
    }

    getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    handleMouseDown(event) {
        const mousePos = this.getMousePos(event);
        const MARKER_SIZE = 24;
        const HALF_SIZE = MARKER_SIZE / 2;
        
        // Check each layer's corner points first
        for (let i = this.screenLayers.length - 1; i >= 0; i--) {
            const layer = this.screenLayers[i];
            
            // Check corner points first
            for (let j = 0; j < layer.cornerPoints.length; j++) {
                const point = layer.cornerPoints[j];
                if (mousePos.x >= point.x - HALF_SIZE && 
                    mousePos.x <= point.x + HALF_SIZE && 
                    mousePos.y >= point.y - HALF_SIZE && 
                    mousePos.y <= point.y + HALF_SIZE) {
                    this.selectedLayer = i;
                    this.selectedPoint = j;
                    this.isDragging = true;
                    this.lastMousePos = mousePos;
                    this.render();
                    return;
                }
            }

            // If no corner point is clicked, check if clicked inside the layer
            if (this.isPointInLayer(mousePos, layer)) {
                this.selectedLayer = i;
                this.selectedPoint = null; // null indicates we're dragging the whole layer
                this.isDragging = true;
                this.lastMousePos = mousePos;
                this.render();
                return;
            }
        }

        this.selectedLayer = null;
        this.selectedPoint = null;
        this.isDragging = false;
        this.render();
    }

    handleMouseMove(event) {
        if (!this.isDragging || this.selectedLayer === null) return;

        const mousePos = this.getMousePos(event);
        const layer = this.screenLayers[this.selectedLayer];

        if (this.selectedPoint !== null) {
            // Dragging a corner point
            layer.cornerPoints[this.selectedPoint] = mousePos;
        } else {
            // Dragging the entire layer
            const dx = mousePos.x - this.lastMousePos.x;
            const dy = mousePos.y - this.lastMousePos.y;
            
            // Move all corner points
            layer.cornerPoints.forEach(point => {
                point.x += dx;
                point.y += dy;
            });
        }

        this.lastMousePos = mousePos;
        this.render();
    }

    handleMouseUp() {
        this.isDragging = false;
        this.lastMousePos = null;
    }

    isPointInLayer(point, layer) {
        // Get the bounding box of the layer
        const points = layer.cornerPoints;
        const minX = Math.min(...points.map(p => p.x));
        const maxX = Math.max(...points.map(p => p.x));
        const minY = Math.min(...points.map(p => p.y));
        const maxY = Math.max(...points.map(p => p.y));

        // Check if point is within the bounding box
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
    }

    drawCornerPoints() {
        const MARKER_SIZE = 24;
        const HALF_SIZE = MARKER_SIZE / 2;
        const CENTER_DOT_SIZE = 3;
        const HALF_DOT_SIZE = CENTER_DOT_SIZE / 2;

        // Store current blend mode and restore it later
        const currentBlendMode = this.ctx.globalCompositeOperation;
        this.ctx.globalCompositeOperation = 'source-over';

        // Draw all layers' corner points and borders
        this.screenLayers.forEach((layer, layerIndex) => {
            // Draw border
            this.ctx.beginPath();
            this.ctx.moveTo(layer.cornerPoints[0].x, layer.cornerPoints[0].y);
            for (let i = 1; i < layer.cornerPoints.length; i++) {
                this.ctx.lineTo(layer.cornerPoints[i].x, layer.cornerPoints[i].y);
            }
            this.ctx.closePath();
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Draw corner points
            layer.cornerPoints.forEach((point, pointIndex) => {
                // Save context state
                this.ctx.save();

                // Draw the border
                this.ctx.strokeStyle = 'black';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(
                    point.x - HALF_SIZE,
                    point.y - HALF_SIZE,
                    MARKER_SIZE,
                    MARKER_SIZE
                );

                // Draw the center dot
                this.ctx.beginPath();
                this.ctx.arc(
                    point.x,
                    point.y,
                    HALF_DOT_SIZE,
                    0,
                    Math.PI * 2
                );
                this.ctx.fillStyle = 'black';
                this.ctx.fill();

                // Highlight selected point
                if (this.selectedLayer === layerIndex && this.selectedPoint === pointIndex) {
                    this.ctx.strokeStyle = '#FFF';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(
                        point.x - HALF_SIZE - 2,
                        point.y - HALF_SIZE - 2,
                        MARKER_SIZE + 4,
                        MARKER_SIZE + 4
                    );
                }

                // Restore context state
                this.ctx.restore();
            });
        });

        // Restore original blend mode
        this.ctx.globalCompositeOperation = currentBlendMode;
    }

    render(hidePoints = false) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image
        if (this.backgroundImage) {
            this.ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        }

        // Draw all screen layers
        this.screenLayers.forEach(layer => {
            this.imageTransformer.drawImage(layer.image, layer.cornerPoints, layer.blendMode, false);
        });

        // Draw corner points unless hidden
        if (!hidePoints) {
            this.drawCornerPoints();
        }
    }

    downloadImage() {
        // Create a new canvas for the download
        const downloadCanvas = document.createElement('canvas');
        downloadCanvas.width = this.canvas.width;
        downloadCanvas.height = this.canvas.height;
        const downloadCtx = downloadCanvas.getContext('2d');

        // Create a new ImageTransformer for the download context
        const downloadTransformer = new ImageTransformer(downloadCtx);

        // Draw background image
        if (this.backgroundImage) {
            downloadCtx.drawImage(this.backgroundImage, 0, 0, downloadCanvas.width, downloadCanvas.height);
        }

        // Draw all screen layers in high quality
        this.screenLayers.forEach(layer => {
            downloadTransformer.drawImage(layer.image, layer.cornerPoints, layer.blendMode, true);
        });

        // Create and trigger download
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `mockup-${timestamp}.png`;
        
        // Force rendering completion before getting data URL
        downloadCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }

    async copyToClipboard() {
        try {
            // Create a new canvas for the high-quality render
            const copyCanvas = document.createElement('canvas');
            copyCanvas.width = this.canvas.width;
            copyCanvas.height = this.canvas.height;
            const copyCtx = copyCanvas.getContext('2d');

            // Create a new ImageTransformer for the copy context
            const copyTransformer = new ImageTransformer(copyCtx);

            // Draw background image
            if (this.backgroundImage) {
                copyCtx.drawImage(this.backgroundImage, 0, 0, copyCanvas.width, copyCanvas.height);
            }

            // Draw all screen layers in high quality
            this.screenLayers.forEach(layer => {
                copyTransformer.drawImage(layer.image, layer.cornerPoints, layer.blendMode, true);
            });

            // Convert the canvas to a blob
            const blob = await new Promise(resolve => copyCanvas.toBlob(resolve, 'image/png'));
            
            // Create a ClipboardItem
            const data = new ClipboardItem({
                'image/png': blob
            });
            
            // Copy to clipboard
            await navigator.clipboard.write([data]);
            
            // Visual feedback
            const copyButton = document.getElementById('copyButton');
            const icon = copyButton.querySelector('.material-icons');
            
            // Save original icon text
            const originalIcon = icon.textContent;
            
            // Add success class and change icon
            copyButton.classList.add('success');
            icon.textContent = 'check';
            
            // Reset after animation
            setTimeout(() => {
                copyButton.classList.remove('success');
                icon.textContent = originalIcon;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy image to clipboard. Your browser may not support this feature.');
        }
    }

    async animateToMockupArea(layer, targetCorners) {
        // Animate the corner points to the target positions
        await MockupAnimator.animateCorners(
            layer.cornerPoints,
            targetCorners,
            1000, // 1 second duration
            (points) => {
                layer.cornerPoints = points;
                this.render();
            }
        );
    }
}

// Initialize the editor when the page loads
window.addEventListener('load', () => {
    new MockupEditor();
}); 