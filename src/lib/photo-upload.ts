import {validateMedia} from './handover-api';
/** Exact allowlist shared with handover photos, never derive paths from filenames. */
export function photoUploadMetadata(blob:Blob):{contentType:string;extension:string}{
 const contentType=validateMedia(blob,'photo');
 const extension:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 return {contentType,extension:extension[contentType]};
}
