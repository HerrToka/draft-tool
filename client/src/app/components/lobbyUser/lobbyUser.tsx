import Image from "next/image";
import styles from "./lobbyUser.module.css"

import logo from "../../../assets/logo.png";
import Offlane from '../../../assets/icons/offlane.png'
import Midlane from '../../../assets/icons/midlane.png'
import Carry from '../../../assets/icons/carry.png'
import Jungle from '../../../assets/icons/jungle.png'
import Support from '../../../assets/icons/Support.png'


const roleRender = (role: string) => {
    switch(role){
        case 'Carry':
            return <Image width='30' height='30' src={Carry} alt='Predecessor Carry Icon'/>
            break;
        case 'Support':
            return <Image width='30' height='30' src={Support} alt='Predecessor Support Icon'/>
            break;
        case 'Midlane':
            return <Image width='30' height='30' src={Midlane} alt='Predecessor Midlane Icon'/>
            break;
        case 'Jungle':
            return <Image width='30' height='30' src={Jungle} alt='Predecessor Jungle Icon'/>
            break;
        case 'Offlane':
            return <Image width='30' height='30' src={Offlane} alt='Predecessor Offlane Icon'/>
            break;
        default:
            return <></>
            break;
    }
}

export default function LobbyUser(props:{username:string, status:string, hero:string, role: "Carry" | "Support" | "Midlane" | "Jungle" | "Offlane" | "None", pos:string}) {
    return (
        <div className={props.pos == 'left' ? styles.playerWrapperLeft : styles.playerWrapperRight}>
            <div className={styles.imageWrapper}>
                <Image width='96' height='96' src={logo} alt="PredDraft Logo"></Image>
            </div>

            <div className={styles.textWrapper}>
                <span className={styles.username}>{props.username}</span>
                <div className={styles.status}>
                    {props.pos == 'left' ? <div>{roleRender(props.role)}</div> : ''}
                    <span className={styles.heroName}>{props.hero == 'None' ? props.status : props.hero}</span>
                </div>
            </div>
        </div>
    )
}