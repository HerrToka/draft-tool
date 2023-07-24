'use client'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import io from 'socket.io-client'

import Image from 'next/image'
import styles from './create.module.css'

import Link from 'next/link'
import Logo from '../components/logo/logo'
import { create } from 'domain'


export default function CreateLobby () {
    
    const socket = io('http://localhost:3001')
    const router = useRouter();
    //const { data: session } = useSession();

    function handleSubmit(e: any) {
        //Prevent browser from reloading
        e.preventDefault();

        //Read form data
        const form = e.target
        const formData = new FormData(form);
        const formJson = Object.fromEntries(formData.entries())

        //this event is now started on the draft site itself
        //socket.emit('create-room', formJson)

        //redirect to draft page and pass form entries to the draft via url
        const lobbyCode = formJson.lobbyCode
        //sessionStorage.setItem //set LobbyCode in session storage to not reveal it via url --> possible with all the other keys aswell
        router.push(`/draft?&numPickBan=${formJson.numPickBan ? formJson.numPickBan : 0}&mirrorMatchAllowed=${formJson.mirrorMatchAllowed ? 1 : 0}&randomHero=${formJson.randomHero ? 1 : 0}&team1Name=${formJson.team1Name ? formJson.team1Name : ""}&team2Name=${formJson.team2Name ? formJson.team2Name : ""}&spectate=${formJson.isPlayer ? 0 : 1}&lobbyCode=${formJson.lobbyCode}&cPick=${formJson.cPick ? 1 : 0}`)
    }


    return (
        <div className={styles.createPageWrapper}>
            <Logo></Logo>
            <h2 className={styles.heading}>Draft Settings</h2>
            <form method='post' onSubmit={handleSubmit} className={styles.createForm}>
                <div className={styles.teamContainer}>
                    <div className={styles.inputContainer}>
                        <label htmlFor="team1Name" className={styles.label}>Team Name 1</label>
                        <input type="text"  name='team1Name' id='team1Name' defaultValue={'Monolith'} className={styles.input}/>
                    </div>
                    <div className={styles.inputContainer}>
                        <label htmlFor="team2Name" className={styles.label}>Team Name 2</label>
                        <input type="text"  name='team2Name' id='team2Name' defaultValue={'Legacy'} className={styles.input}/>
                    </div>
                </div>
                <div className={styles.inputContainer}>
                    <label htmlFor="numPickBan" className={styles.label}>Number Of Bans</label>
                    <input name="numPickBan" id='numPickBan' type='number' defaultValue={1} min={0} max={2} className={styles.input}/>
                </div>
                <div className={styles.inputContainer}>
                    <label htmlFor="lobbyCode" className={styles.label}>Lobby Code</label>
                    <input type="text"  name='lobbyCode' id='lobbyCode' required className={styles.input}/>
                </div>
                <div className={styles.cbContainer}>
                    <div className={styles.cbInputContainer}>
                        <label htmlFor="randomHero" className={styles.cbLabel}>ARAM</label>
                        <input type="checkbox" name="randomHero" id="randomHero" className={styles.cb} />   
                    </div>
                    <div className={styles.cbInputContainer}>
                        <label htmlFor="mirrorMatchAllowed" className={styles.cbLabel}>Allow Mirror Matches</label>
                        <input type="checkbox" name="mirrorMatchAllowed" id="mirrorMatchAllowed" className={styles.cb} />   
                    </div>
                    <div className={styles.cbInputContainer}>
                        <label htmlFor="isPlayer" className={styles.cbLabel}>Join Lobby As Player</label>
                        <input type="checkbox" name="isPlayer" id="isPlayer" className={styles.cb} defaultChecked/>   
                    </div>
                    <div className={styles.cbInputContainer}>
                        <label htmlFor="cPick" className={styles.cbLabel}>Captains Pick Only</label>
                        <input type="checkbox" name="cPick" id="cPick" className={styles.cb} defaultChecked/>   
                    </div>
                </div>
                <button type='submit' className={styles.btn}>create</button>
            </form>
        </div>
    )
}