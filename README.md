PDF Viewer
===

## Overview 

This is a base code for a PDF viewer that can be extended to integrate AI capabilities. 

The PDF viewer supports:
- Scrolling and on-demand rendering
- Text layer rendering and text selection
- Drag-and-drop area selection and snapshot (holding CTRL and use mouse)

Major dependencies:
- "react": "^18.2.0",
- "typescript": "^5.2.2",
- "electron": "^31.3.0",
- "pdfjs-dist": "^4.10.38",
- "webpack": "^5.88.2",
- "electron-builder": "^24.13.3",

## Setting up

After cloning, run the following command to start (you can remove `ELERON_MIRROR` part if you want): 
```bash
$ ELERON_MIRROR="https://cdn.npmmirror.com/binaries/electron/" npm install
```

If you have installed the VSCode extension [better-status-bar](https://marketplace.visualstudio.com/items?itemName=RobertOstermann.better-status-bar) , 
you will see the two buttons in the status bar to compile and run the app.


