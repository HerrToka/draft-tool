'use client'
import Image from 'next/image'
import styles from './join.module.css'

import { io } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Link from 'next/link'
import Logo from '../components/logo/logo'


export default function JoinLobby () {
    const socket = io('http://localhost:3001')
    
    const [lobbyCode, setJoinCode] = useState("")

    //Handle user joining as a player
    const handlePlayerConnect = () => {
        //check if room exists
        socket.emit('join-room', setJoinCode)
        //if room exists, redirect to lobby
        //if room doesn't exist, display error
    }


    //Handle user joining as a spectator
    const handleSpectatorConnect = () => {
        //check if room exists
        //if room exists, redirect to lobby
        //if room doesn't exist, display error
    }

    return (
        <div className={styles.joinPageWrapper}>
            <Logo></Logo>
            <h2 className={styles.heading}>Join Or Spectate</h2>
            <form action="" className={styles.joinForm}>
                <div className={styles.inputContainer}>
                    <label htmlFor="playerName" className={styles.label}>Your Name</label>
                    <input type="text"  name='playerName' id='playerName' placeholder='Name' defaultValue={'Fangtooth'} className={styles.input}/>
                </div>
                <div className={styles.inputContainer}>
                    <label htmlFor="lobbyCode" className={styles.label}>Lobby Code</label>
                    <input type="text"  name='joinCode' id='lobbyCode' className={styles.input} onChange={(e) => setJoinCode(e.target.value)}/>
                </div>
                <div className={styles.btnContainer}>
                    <Link href="/predraft" className={styles.btn}>join</Link>
                    <Link href="/predraft" className={styles.btn}>spectate</Link>
                    <button className={styles.btn} onClick={handlePlayerConnect}>join</button>
                    <button className={styles.btn} onClick={handleSpectatorConnect}>spectate</button>
                </div>
            </form>
        </div>
    )
}