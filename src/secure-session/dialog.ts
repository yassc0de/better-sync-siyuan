import { Dialog } from "siyuan";
import QRCode from "qrcode";
import { createPairingInvite, encodePairingInvite, parsePairingInvite, PendingPairing } from "./pairing";

type Detector = { detect: (image: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/**
 * EXPERIMENT ONLY: QR creation and scanning. No network or note exchange.
 */
export function openPairingDialog(): void {
    let stream: MediaStream | null = null;
    let polling: number | null = null;
    let destroyed = false;
    let activePairing: PendingPairing | null = null;

    const stopCamera = () => {
        if (polling !== null) window.clearInterval(polling);
        polling = null;
        if (stream) stream.getTracks().forEach(track => track.stop());
        stream = null;
    };

    const dialog = new Dialog({
        title: "Local QR sync — experimental",
        width: "460px",
        content: '<div class="b3-dialog__content" style="padding:20px;display:flex;flex-direction:column;gap:12px">' +
            '<p><strong>Pairing prototype only.</strong> No documents will be transferred. Legacy unencrypted sync is disabled in this branch.</p>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="b3-button" data-action="show">Show QR code</button>' +
            '<button class="b3-button" data-action="scan">Scan QR code</button></div>' +
            '<div data-role="qr" style="text-align:center"></div>' +
            '<video data-role="camera" playsinline muted style="display:none;max-width:100%;max-height:240px"></video>' +
            '<label>Manual fallback (paste QR content):</label>' +
            '<textarea class="b3-text-field" data-role="manual" rows="3" placeholder="Pairing invitation JSON"></textarea>' +
            '<button class="b3-button" data-action="parse">Read invitation</button>' +
            '<p data-role="status" aria-live="polite">Idle. No connection is open.</p></div>',
        destroyCallback: () => {
            destroyed = true;
            activePairing = null;
            stopCamera();
        }
    });
    const root = dialog.element;
    const qr = root.querySelector<HTMLElement>('[data-role="qr"]')!;
    const status = root.querySelector<HTMLElement>('[data-role="status"]')!;
    const video = root.querySelector<HTMLVideoElement>('[data-role="camera"]')!;
    const manual = root.querySelector<HTMLTextAreaElement>('[data-role="manual"]')!;
    const setStatus = (message: string) => { if (!destroyed) status.textContent = message; };

    root.querySelector('[data-action="show"]')?.addEventListener("click", async () => {
        stopCamera();
        qr.textContent = "";
        setStatus("Generating a one-time invitation…");
        try {
            const pairing = await createPairingInvite();
            activePairing = pairing;
            // The QR contains public metadata only; never an API token or private key.
            const image = document.createElement("img");
            image.alt = "Temporary pairing invitation QR code";
            image.width = 240;
            image.height = 240;
            image.src = await QRCode.toDataURL(encodePairingInvite(pairing.invite), {
                errorCorrectionLevel: "M", margin: 2, width: 240
            });
            if (destroyed) return;
            qr.replaceChildren(image);
            setStatus(activePairing ?
                "QR expires in 2 minutes. Session transport is NOT implemented yet." :
                "Unable to create invitation.");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Cannot generate QR code");
        }
    });

    const receiveInvite = (content: string) => {
        try {
            const invite = parsePairingInvite(content);
            stopCamera();
            video.style.display = "none";
            setStatus("Valid invitation " + invite.sessionId.slice(0, 8) +
                " detected. No connection or synchronization has occurred.");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Invalid QR code");
        }
    };

    root.querySelector('[data-action="parse"]')?.addEventListener("click", () => receiveInvite(manual.value.trim()));
    root.querySelector('[data-action="scan"]')?.addEventListener("click", async () => {
        stopCamera();
        const DetectorClass = (globalThis as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
        if (!DetectorClass) {
            setStatus("Camera QR scanning is not supported by this WebView. Use manual fallback.");
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }, audio: false
            });
            if (destroyed) { stopCamera(); return; }
            video.srcObject = stream;
            video.style.display = "block";
            await video.play();
            const detector = new DetectorClass({ formats: ["qr_code"] });
            setStatus("Scanning QR…");
            polling = window.setInterval(async () => {
                if (!stream || video.readyState < 2) return;
                try {
                    const codes = await detector.detect(video);
                    if (codes.length) receiveInvite(codes[0].rawValue);
                } catch { /* Some frames are undecodable; keep scanning. */ }
            }, 300);
        } catch (error) {
            stopCamera();
            setStatus(error instanceof Error ? error.message : "Unable to access camera");
        }
    });
}
