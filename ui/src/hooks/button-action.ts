import {useState} from "react";

function useButtonAction() {
    const [activeAction, setActiveAction] = useState('')
    const buttonAction = async (callback: () => Promise<void>, actionName: string) => {
        setActiveAction(actionName)
        try {
            await callback()
        } finally {
            setActiveAction('')
        }
    }

    return {activeAction, buttonAction}
}

export default useButtonAction
