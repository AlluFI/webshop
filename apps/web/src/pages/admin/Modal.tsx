import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleClose = () => onCloseRef.current();
    node.addEventListener("close", handleClose);

    if (open) {
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.removeEventListener("close", handleClose);
      node.close();
    }

    return () => {
      node.removeEventListener("close", handleClose);
      if (node.open) node.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="link" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

