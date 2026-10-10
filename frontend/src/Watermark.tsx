export const WATERMARK_LINES = ['Designed by Dinda', 'With Love to Rimo da'] as const

function WatermarkText() {
    return (
        <>
            <span className="watermark-line">{WATERMARK_LINES[0]}</span>
            <span className="watermark-line">
                {WATERMARK_LINES[1]} <span aria-hidden="true" className="watermark-heart">♥</span>
            </span>
        </>
    )
}

export function Watermark() {
    return (
        <footer className="watermark">
            <p className="watermark-text"><WatermarkText /></p>
        </footer>
    )
}

export function SplashScreen() {
    return (
        <main className="splash-screen" role="status">
            <div className="splash-content">
                <div aria-hidden="true" className="splash-faces">
                    <img alt="" src="/players/rooney.webp" />
                    <img alt="" src="/players/manchester-united.png" />
                    <img alt="" src="/players/messi.jpg" />
                </div>
                <p className="watermark-text"><WatermarkText /></p>
            </div>
        </main>
    )
}
