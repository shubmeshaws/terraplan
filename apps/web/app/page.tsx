import { ScriptLoader } from '@/components/script-loader';
import { markup } from './markup';

export default function Home() {
  return (
    <>
      <div className="contents" dangerouslySetInnerHTML={{ __html: markup }} />
      <ScriptLoader />
    </>
  );
}
