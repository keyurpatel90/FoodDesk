import './globals.css';
import './materialize.css';
import type { Metadata } from 'next';
export const metadata: Metadata={title:'FoodDesk',description:'FoodDesk — fast, offline-first POS that just works',manifest:'/manifest.webmanifest'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap"/></head><body>{children}</body></html>}
