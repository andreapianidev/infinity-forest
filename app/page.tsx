'use client';
import dynamic from 'next/dynamic';

const Forest = dynamic(() => import('@/components/Forest'), { ssr: false });

export default function Page() {
  return <Forest />;
}
