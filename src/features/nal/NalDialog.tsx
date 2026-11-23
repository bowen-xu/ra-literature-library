import { useEffect,useRef,type ReactNode } from "react";
import { X } from "lucide-react";
export function NalDialog({title,children,onClose,busy=false,className=""}:{readonly title:string;readonly children:ReactNode;readonly onClose:()=>void;readonly busy?:boolean;readonly className?:string}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const focus=document.activeElement,el=ref.current;el?.showModal();return()=>{el?.close();if(focus instanceof HTMLElement && focus.isConnected)focus.focus();};},[]);
  return <dialog ref={ref} className={`nal-dialog ${className}`} aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <header><h3>{title}</h3><button type="button" aria-label="关闭面板" disabled={busy} onClick={onClose}><X size={17}/></button></header>{children}
  </dialog>;
}
