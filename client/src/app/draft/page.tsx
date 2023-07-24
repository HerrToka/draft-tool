'use client'
//Styles
import styles from './draft.module.css'

import Image, { StaticImageData } from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { DefaultEventsMap } from 'socket.io/dist/typed-events'
import Countdown from 'react-countdown'
import { useSession } from 'next-auth/react'
//Logo
import logo from '../../assets/logo.png'
//Role Icons
import offIcon from '../../assets/icons/offlane.svg'
import midIcon from '../../assets/icons/midlane.svg'
import jungleIcon from '../../assets/icons/jungle.svg'
import carryIcon from '../../assets/icons/carry.svg'
import supIcon from '../../assets/icons/support.svg'
//Hero Icons
import Countess from '../../assets/heroes/countess.png'
import Crunch from '../../assets/heroes/crunch.png'
import Dekker from '../../assets/heroes/dekker.png'
import Drongo from '../../assets/heroes/drongo.png'
import FengMao from '../../assets/heroes/fengmao.png'
import Fey from '../../assets/heroes/fey.png'
import Gadget from '../../assets/heroes/gadget.png'
import Gideon from '../../assets/heroes/gideon.png'
import Greystone from '../../assets/heroes/greystone.png'
import Grux from '../../assets/heroes/grux.png'
import Howitzer from '../../assets/heroes/howitzer.png'
import Kallari from '../../assets/heroes/kallari.png'
import Khaimera from '../../assets/heroes/khaimera.png'
import Kira from '../../assets/heroes/kira.png'
import LtBelica from '../../assets/heroes/belica.png'
import Morigesh from '../../assets/heroes/morigesh.png'
import Murdock from '../../assets/heroes/murdock.png'
import Muriel from '../../assets/heroes/muriel.png'
import Narbash from '../../assets/heroes/narbash.png'
import Phase from '../../assets/heroes/phase.png'
import Rampage from '../../assets/heroes/rampage.png'
import Revenant from '../../assets/heroes/revenant.png'
import Riktor from '../../assets/heroes/riktor.png'
import Sevarog from '../../assets/heroes/sevarog.png'
import Shinbi from '../../assets/heroes/shinbi.png'
import Sparrow from '../../assets/heroes/sparrow.png'
import Steel from '../../assets/heroes/steel.png'

import Link from 'next/link'
import Logo from '../components/logo/logo'




export default function Draft() {


    interface Hero {
        "Name": string,
        "Status": "banned" | "picked" | "" | "hovered"
    }

    interface Player {
        "Username": string,
        "SocketID": string,
        "Status": string,
        "Hero": string,
        //"Role": "Carry" | "Support" | "Midlane" | "Jungle" | "Offlane" | "None",
        "Team": 0 | 1 | 2 
    }

    interface GameState {
        "Action": "waiting" | "team1Banning" | "team2Banning" | "team1Picking" | "team2Picking" | "finished",
        //Unsure how to disply that right now
        "ActiveUser": PlayerActiveUser[],
        "Team1": string,
        "Team2": string,
        "Timer": number,
        //Probably not needed... left it in for now
        "PlayerCount": number,
        "LobbyCode": string
    }
    type PlayerActiveUser = Pick<Player, "Username" | "SocketID">

    // interface Role {
    //     "RoleName": string
    // }

    const heroImageSwitcher = (heroName: string): StaticImageData => {
        switch(heroName){
            case 'Countess':
                return Countess
            case 'Crunch':
                return Crunch
            case 'Dekker':
                return Dekker
            case 'Drongo':
                return Drongo
            case 'FengMao':
                return FengMao
            case 'Gadget':
                return Gadget
            case 'Gideon':
                return Gideon
            case 'Greystone':
                return Greystone
            case 'Grux':
                return Grux
            case 'Howitzer':
                return Howitzer
            case 'Kallari':
                return Kallari
            case 'Khaimera':
                return Khaimera
            case 'Kira':
                return Kira
            case 'LtBelica':
                return LtBelica
            case 'Morigesh':
                return Morigesh
            case 'Murdock':
                return Murdock
            case 'Muriel':
                return Muriel
            case 'Narbash':
                return Narbash
            case 'Phase':
                return Phase
            case 'Rampage':
                return Rampage
            case 'Revenant':
                return Revenant
            case 'Riktor':
                return Riktor
            case 'Sevarog':
                return Sevarog
            case 'Shinbi':
                return Shinbi
            case 'Sparrow':
                return Sparrow
            case 'Steel':
                return Steel
            case 'Fey':
                return Fey
            default:
                return logo
        }
    }


    const router = useRouter() //seems outdated

    //retreive data from create page through url
    const draftSettings = useSearchParams()
    
    const numPickBan = draftSettings.get('numPickBan')
    const mirrorMatchAllowed = draftSettings.get('mirrorMatchAllowed')
    const team1Name = draftSettings.get('team1Name')
    const team2Name = draftSettings.get('team2Name')
    const spectate = draftSettings.get('spectate')
    const randomHero = draftSettings.get('randomHero')
    const lobbyCode = draftSettings.get('lobbyCode')
    
    //console.log(numPickBan, mirrorMatchAllowed, team1Name, team2Name, spectate, randomHero, lobbyCode)

    const [socket, setSocket] = useState<Socket<DefaultEventsMap, DefaultEventsMap> | undefined>();
    const [localSockedID, setLocalSocketID] = useState('')
    const [copiedLobbyCode, setCopiedLobbyCode] = useState(false)
    const [hideLobbyCode, setHideLobbyCode] = useState(true)
    const [gameState, setGameState] = useState<GameState>({'Action': 'waiting', 'ActiveUser':[{Username: "", SocketID: ""}], 'Team1':'', 'Team2':'', 'Timer': 0, 'PlayerCount': 0, 'LobbyCode':''});
    const [localTeam, setLocalTeam] = useState('')
    const [team1, setTeam1] = useState<Player[]>([]);
    const [team2, setTeam2] = useState<Player[]>([]);
    const [spectator, setSpectator] = useState(false);
    //const [roles, setRoles] = useState<Role[]>([]) //not used yet

    const [heroes, setHeroes] = useState<Hero[]>([]);
    const [heroHover, setHeroHover] = useState<string>('');
    const [bannedHeroesTeam1, setBannedHeroesTeam1] = useState<string[]>([]);
    const [bannedHeroesTeam2, setBannedHeroesTeam2] = useState<string[]>([]);

    const [localDate, setLocalDate] = useState(Date.now());
    const dateStatus = useRef('waiting');

    
    useEffect(() => {
        //connect to websocket
        let socket: Socket<DefaultEventsMap, DefaultEventsMap> | undefined
        if(lobbyCode != undefined && mirrorMatchAllowed != undefined && numPickBan != undefined && team1Name != undefined && team2Name != undefined) {
            //send create lobby request and join lobby
            socket = io('http://localhost:3001', { query: {"request": "createLobby", "mirrorMatchAllowed": mirrorMatchAllowed, "ARAM": randomHero, "numPickBan": numPickBan, "team1Name": team1Name, "team2Name": team2Name, "spectator": spectate} });
            setSocket(socket); 
            console.log('createLobby')

            //join as spectator if enabled
            if(spectate == '1'){
                setSpectator(true);
                console.log("created as spec");
            }
        } else if (lobbyCode != undefined && spectate != undefined){
            //send join request to lobby
            socket = io('http://localhost:3001', { query: {"request": "joinLobby", "lobbyCode": lobbyCode, "spectator": spectate, } });
            setSocket(socket); 
            console.log('joinLobby')
            //join as spectator if enabled
            if(spectate == '1'){
                setSpectator(true)
                console.log('joined as spec');
            }
        } else {
            //redirect to home 
            void router.push('/')
            console.log('direc url does not work as intended')
        }

        //somehow needed to not get an undefined return on the socket listeners?
        if(socket == undefined) return

        //socket listeners
        socket.on('connect', () => {
            //not much to do here as it is a socket.io default event
            console.log('client connected')
            setLocalSocketID(socket?.id as string)
        })

        socket.on('disconnect', () => {
            //not much to do here as it is a socket.io default event
            console.log('client disconnected')
        })

        socket.on('lobbyJoin', (data: {GameState: GameState, Team1: Player[], Team2: Player[], Heroes: Hero[]}) => { //may get the role as aditional key
            //update the gamestate
            setGameState(data.GameState)
            //update team 1
            setTeam1(data.Team1)
            //update team 2
            setTeam2(data.Team2)
            //update heroes
            setHeroes(data.Heroes)
            //update date for countdown
            dateStatus.current = data.GameState.Action
        })

        socket.on('lobbyUpdated', (data: {GameState: GameState, Team1: Player[], Team2: Player[], Team1Banned: string[], Team2Banned: string[], Heroes: Hero[], }) => { //may get the role as aditional key
            console.log('lobbyUpdated', data)
            //update local date for countdown
            if(data.GameState.Timer != 0) {
                if(data.GameState.Action != dateStatus.current) {
                    console.log(data.GameState.Action, dateStatus.current);
                    console.log('equal?', data.GameState.Action == dateStatus.current)
                    console.log('updating local date')
                    setLocalDate(Date.now())
                }
            }

            //update gameState
            setGameState(data.GameState);
            //update team1
            setTeam1(data.Team1);
            //update team2
            setTeam2(data.Team2);
            //update heroes
            setHeroes(data.Heroes);
            //update banned heroes
            setBannedHeroesTeam1(data.Team1Banned);
            setBannedHeroesTeam2(data.Team2Banned);

            //update date for countdown
            dateStatus.current = data.GameState.Action

        })

        //cleanup | This is called when the component is unmounted to remove all listeners
        return () => {
            if(socket == undefined) return

            socket.off('connect');
            socket.off('disconnect');
            socket.off('lobbyCreated');
            socket.off('lobbyUpdated');
            socket.close();
        }

    }, [])

    //copy lobby code on click
    function handleCopyClick() {
        setCopiedLobbyCode(true)
        void navigator.clipboard.writeText(gameState.LobbyCode)
        //reset 
        setTimeout(() => {
            setCopiedLobbyCode(false)
        }, 2000)
    }

    function handleHeroClick(hero:string, team:string) {
        console.log('hero clicked', hero, team)
        console.log('gameState', gameState)
        console.log(localSockedID)

        //checke if hero click is allowed 
        const checkIfAllowed = (): boolean => {

            if(gameState.Action == 'team1Banning' || gameState.Action == 'team2Banning') {
                if(gameState.ActiveUser[0]?.SocketID == localTeam) {
                    return true
                } else {
                    return false
                }
            }else if(gameState.Action == 'team1Picking' || gameState.Action == 'team2Picking') {
                if(gameState.ActiveUser[0]?.SocketID == localSockedID || gameState.ActiveUser[1]?.SocketID == localSockedID) {
                    if(team1.find(x => x.SocketID == localSockedID)?.Status == "picked" || team2.find(x => x.SocketID == localSockedID)?.Status == "picked") {
                        console.log('already picked')
                        return false
                    } else {
                        return true
                    }
                } else {
                    return false
                }
            }else {
                return false;
            }
        }

        if(checkIfAllowed()) {
            console.log('before emit')
            //performs the gameState Action on the server side
            //for the selected hero and player 
            //this is for the picks and bans

            //the gameState action will be set by the server and passed to the client
            //this packet will need to modify the server Heroes array and the respective Team array
            
            //emit only if hero status is not banned or picked
            if(heroes.find(x => x.Name == hero)?.Status != 'banned' && heroes.find(x => x.Name == hero)?.Status != 'picked' && heroes.find(x => x.Name == hero)?.Status != 'hovered') {
                console.log('emitting')
                if(gameState.Action == 'team1Picking' || gameState.Action == 'team2Picking') {
                    //set hero hover
                    console.log('setting hero hover', hero)
                    setHeroHover(hero)
                    socket?.emit('heroHover', {"lobbyCode": gameState.LobbyCode, "hero": heroHover, 'team': team})
                } else {
                    socket?.emit(gameState.Action, {"lobbyCode": gameState.LobbyCode, "hero": hero, 'team': team})
                } 
            } else if(heroHover != '') {
                //clear hero hover
                console.log("clearing hero hover")
                socket?.emit('heroHover', {"lobbyCode": gameState.LobbyCode, "hero": heroHover, 'team': team})
                setHeroHover('')
            }
        }

    }

    function handleHeroLockIn(hero:string, team:string) {
        //emit gameState Action as event to server for the selected hero and player
        //only for picks
        console.log('Locking in Hero', hero)
        socket?.emit(gameState.Action, {lobbyCode: gameState.LobbyCode, "hero": hero, 'team': team})
        setHeroHover('')
    }

    //function handlePlayerRoleClick(role:string) {} //not used yet

    function handleTeamClick(team:string) {
        //update user team locally and on server side
        setLocalTeam(team)
        socket?.emit(gameState.Action, {"lobbyCode": gameState.LobbyCode}) //may get the role as aditional key
    }

    const HeroSelect: React.FC<{heroName: string, heroStatus: string, team:string, voteBanCount: number}> = ({heroName, heroStatus, team, voteBanCount}) => {

        const heroImage = heroImageSwitcher(heroName)

        return (
            <div onClick={() => handleHeroClick(heroName, team)} key={heroName}>
                <Image className={heroStatus == 'banned' ? styles.banned : heroStatus == 'picked' ? styles.picked : heroStatus == 'hovered' ? styles.picked : styles.hero} src={heroImage} alt={heroName + ' portrait'} width='100' height='100'></Image>
                <span></span> 
            </div>
        )
    }




    
    //Show the interface in a switch case for the current GameState
    return (
        <div>Draft</div>
    )


}