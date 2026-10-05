import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata={title:'Food Event Desk',description:'Free food-event order and kitchen display system',manifest:'/manifest.webmanifest'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
