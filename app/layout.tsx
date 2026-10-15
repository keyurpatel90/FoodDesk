import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata={title:'Food Event Desk',description:'FoodDesk — fast, offline-first POS that just works',manifest:'/manifest.webmanifest'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
