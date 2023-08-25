'use client'
import Image from 'next/image'
import styles from './join.module.css'

import { io } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Link from 'next/link'
import Logo from '../components/logo/logo'


export default function JoinLobby () {    
    const [lobbyCode, setLobbyCode] = useState("")
    const router = useRouter();

    function handleSubmit(e: any) {
        //Prevent browser from reloading
        e.preventDefault();

        //Read form data
        const form = e.target;
        const formData = new FormData(form);
        const formJson = Object.fromEntries(formData.entries());

        //this event is now started on the draft site itself
        //socket.emit('create-room', formJson)

        //redirect to draft page and pass form entries to the draft via url
        //sessionStorage.setItem //set LobbyCode in session storage to not reveal it via url --> possible with all the other keys aswell
        router.push(`/draft?lobbyCode=${formJson.lobbyCode ? formJson.lobbyCode : ""}&playerName=${formJson.playerName ? formJson.playerName : ""}&spectate=${formJson.isPlayer ? 0 : 1}`)
    }

    return (
        <div className={styles.joinPageWrapper}>
            <Logo></Logo>
            <h2 className={styles.heading}>Join Or Spectate</h2>
            <form action="post" className={styles.joinForm} onSubmit={handleSubmit}>
                <div className={styles.inputContainer}>
                    <label htmlFor="playerName" className={styles.label}>Your Name</label>
                    <input type="text"  name='playerName' id='playerName' placeholder='Name' defaultValue={'Fangtooth'} className={styles.input}/>
                </div>
                <div className={styles.inputContainer}>
                    <label htmlFor="lobbyCode" className={styles.label}>Lobby Code</label>
                    <input type="text"  name='lobbyCode' id='lobbyCode' className={styles.input}/>
                </div>
                <div className={styles.cbContainer}>
                    <div className={styles.cbInputContainer}>
                        <label htmlFor="isPlayer" className={styles.cbLabel}>Join Lobby As Player</label>
                        <input type="checkbox" name="isPlayer" id="isPlayer" className={styles.cb}/>   
                    </div>
                </div>
                <div className={styles.btnContainer}>
                    <button type='submit' className={styles.btn}>join lobby</button>
                </div>
            </form>
        </div>
    )
}