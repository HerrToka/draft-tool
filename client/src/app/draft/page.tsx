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
import Twinblast from '../../assets/heroes/twinblast.png'
import Zarus from '../../assets/heroes/zarus.png'


import Link from 'next/link'
import Logo from '../components/logo/logo'
import LobbyUser from '../components/lobbyUser/lobbyUser'
import { off } from 'process'




export default function Draft() {

    interface Hero {
        "Name": string,
        "Status": "banned" | "picked" | "" | "hovered",
        "Image": StaticImageData,
        "Votes": number,
    }

    interface Player {
        "Username": string,
        "SocketID": string,
        "Status": string,
        "Hero": string,
        "Role": "Carry" | "Support" | "Midlane" | "Jungle" | "Offlane" | "None",
        "Team": 0 | 1 | 2 
    }

    interface GameState {
        "Action": "waiting" | "team1Banning" | "team2Banning" | "team1Picking" | "team2Picking" | "finished",
        "ActiveUser": PlayerActiveUser[],
        "Team1": string,
        "Team2": string,
        "SocketID": string,
        "Timer": number,
        "PlayerCount": number,
        "LobbyCode": string
        "PlayersNeeded": 2 | 10,
    }

    type PlayerActiveUser = Pick<Player, "Username" | "SocketID">

    interface Role {
        "RoleName": string,
    }

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
            case 'Twinblast':
                return Twinblast
            case 'Zarus':
                return Zarus
            default:
                return logo
        }
    }


    // const router = useRouter() // outdated

    //retreive data from create page through url
    const draftSettings = useSearchParams()
    
    const numPickBan = draftSettings.get('numPickBan')
    const mirrorMatchAllowed = draftSettings.get('mirrorMatchAllowed')
    const team1Name = draftSettings.get('team1Name')
    const team2Name = draftSettings.get('team2Name')
    const spectate = draftSettings.get('spectate')
    const aram = draftSettings.get('aram')
    const joinCode = draftSettings.get('lobbyCode')
    const playersNeeded = draftSettings.get('cPick') 
    const playerName = draftSettings.get('playerName')
    const team1FirstPick = draftSettings.get('firstPick') // TO DO - add in create page field + add it to url only 1 or 0
    
    //console.log(numPickBan, mirrorMatchAllowed, team1Name, team2Name, spectate, randomHero, lobbyCode)

    const [socket, setSocket] = useState<Socket<DefaultEventsMap, DefaultEventsMap> | undefined>();
    const [localSocketID, setLocalSocketID] = useState('')
    const [copiedLobbyCode, setCopiedLobbyCode] = useState(false)
    const [hideLobbyCode, setHideLobbyCode] = useState(true)
    const [gameState, setGameState] = useState<GameState>({'Action': 'waiting', 'ActiveUser':[{Username: "", SocketID: ""}], 'Team1':'', 'Team2':'', 'Timer': 0, 'PlayerCount': 0, 'LobbyCode':'', 'SocketID':'', "PlayersNeeded": 2});
    const [localTeam, setLocalTeam] = useState('')
    const [team1, setTeam1] = useState<Player[]>([]);
    const [team2, setTeam2] = useState<Player[]>([]);
    const [spectator, setSpectator] = useState(false);
    const [roles, setRoles] = useState<Role[]>([])

    const [heroes, setHeroes] = useState<Hero[]>([]);
    const [heroHover, setHeroHover] = useState<string>('');
    const [bannedHeroesTeam1, setBannedHeroesTeam1] = useState<string[]>([]);
    const [bannedHeroesTeam2, setBannedHeroesTeam2] = useState<string[]>([]);

    const [localDate, setLocalDate] = useState(Date.now());
    const dateStatus = useRef('waiting');

    
    useEffect(() => {

        //connect to websocket
        let socket: Socket<DefaultEventsMap, DefaultEventsMap> | undefined
        if(joinCode == undefined && mirrorMatchAllowed != undefined && numPickBan != undefined && team1Name != undefined && team2Name != undefined && spectate != undefined && playersNeeded != undefined) {
            //send create lobby request and join lobby
            socket = io('http://localhost:3001', { query: {"request": "createLobby", "playerName": playerName, "mirrorMatchAllowed": mirrorMatchAllowed, "ARAM": aram, "numPickBan": numPickBan, "team1Name": team1Name, "team2Name": team2Name, "spectator": spectate, "playersNeeded": playersNeeded, "team1FirstPick": team1FirstPick} });
            setSocket(socket); 
            console.log('createLobby')

            //join as spectator if enabled
            if(spectate == '1'){
                setSpectator(true);
                console.log("created as spec");
            }
        } else if (joinCode != undefined && spectate != undefined && spectate != undefined){
            //send join request to lobby
            socket = io('http://localhost:3001', { query: {"request": "joinLobby", "lobbyCode": joinCode, "spectator": spectate, "playerName": playerName} });
            setSocket(socket); 
            console.log('joinLobby')
            //join as spectator if enabled
            if(spectate == '1'){
                setSpectator(true)
                console.log('joined as spec');
            }
        } else {
            //redirect to home 
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

        socket.on('lobbyJoin', (data: {GameState: GameState, Team1: Player[], Team2: Player[], Heroes: Hero[], Roles: Role[]}) => {
            //update the gamestate
            setGameState(data.GameState)
            //update team 1
            setTeam1(data.Team1)
            //update team 2
            setTeam2(data.Team2)
            //update heroes
            setHeroes(data.Heroes)
            //update Roles
            setRoles(data.Roles);
            //update date for countdown
            dateStatus.current = data.GameState.Action
        })

        socket.on('lobbyUpdated', (data: {GameState: GameState, Team1: Player[], Team2: Player[], Team1Banned: string[], Team2Banned: string[], Heroes: Hero[], Roles: Role[]}) => {
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
            //update Roles
            setRoles(data.Roles);
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
        console.log(localSocketID)

        //checke if hero click is allowed 
        const checkIfAllowed = (): boolean => {
            if(spectator) return false;

            if(gameState.PlayersNeeded == 10){
                if(gameState.Action == 'team1Banning' || gameState.Action == 'team2Banning') {
                    if(gameState.ActiveUser[0]?.Username == localTeam) {
                        return true;
                    }else{
                        return false;
                    }
                }else if(gameState.Action == 'team1Picking' || gameState.Action == 'team2Picking') {
                    if(gameState.ActiveUser[0]?.SocketID == localSocketID || gameState.ActiveUser[1]?.SocketID == localSocketID) {
                        if(team1.find(x => x.SocketID == localSocketID)?.Status == "picked" || team2.find(x => x.SocketID == localSocketID)?.Status == "picked"){
                            console.log("already picked")
                            return false;
                        }else{
                            return true;
                        }
                    }else{
                        return false;
                    }
                }else{
                    return false;
                }
            }else if(gameState.PlayersNeeded == 2){
                // If the user is on the same team as the active user, allow them to pick
                const curTeam = team1.findIndex(player => player.SocketID == localSocketID) != -1 ? 1 : 2;
                const activeTeam = team1.findIndex(player => player.SocketID == gameState.ActiveUser[0]?.SocketID) != -1 ? 1 : 2;
                if(gameState.ActiveUser[0]?.Username == localTeam || curTeam == activeTeam) {
                    return true;
                }else{
                    return false;
                }
            }else{
                return false;
            }
        }

        if(checkIfAllowed()) {
            console.log("before emit")
            //performs the gameState Action on the server side
            //for the selected hero and player 
            //this is for the picks and bans
    
            //the gameState action will be set by the server and passed to client
            //this packet will need to modify the server Heroes array and the respective Team array
            
            //emit only if hero status is not banned or picked
                if(heroes.find(x => x.Name == hero)?.Status != 'banned' && heroes.find(x => x.Name == hero)?.Status != 'picked' && heroes.find(x => x.Name == hero)?.Status != 'hovered'){
                    console.log("emitting")
                    if(gameState.Action == 'team1Picking' || gameState.Action == 'team2Picking'){
                        //set hero hovering
                        console.log("setting hero hover", hero);
                        setHeroHover(hero);
                        socket?.emit('heroHover', {"lobbyCode": gameState.LobbyCode, "hero": hero, 'team': team});
                    }else{
                        socket?.emit(gameState.Action, {"lobbyCode": gameState.LobbyCode, "hero": hero, 'team': team});
                    }
                    
                }else if(heroHover != ''){
                    //clear hero hovering
                    console.log("clearing hero hover");
                    socket?.emit('heroHover', {"lobbyCode": gameState.LobbyCode, "hero": heroHover, 'team': team});
                    setHeroHover('');
                }
            }
        }

        function handleHeroLockIn(hero:string, team:string){
            //performs the gameState Action on the server side
            //for the selected hero and player
            //this is for the picks
            console.log('Locking in hero' + hero)
            socket?.emit(gameState.Action, {"lobbyCode": gameState.LobbyCode, "hero": hero, 'team': team});
            setHeroHover('');
        }

        function handlePlayerRoleClick(role:string){
            //updates the users role 
            console.log("role click", role);
            console.log("gameState", JSON.stringify(gameState));
            socket?.emit(gameState.Action, {"lobbyCode": gameState.LobbyCode, "role": role});
        }

        function handleTeamClick(team:string){
            //update user team locally and server side
            setLocalTeam(team)
            socket?.emit(gameState.Action, {"lobbyCode": gameState.LobbyCode, "team": team});
        }


        //change the frontend after user interaction
        const HeroSelect: React.FC<{heroName: string, heroStatus: string, voteBanCount: number, team:string}> = ({heroName, heroStatus, voteBanCount, team}) => {

            const heroImage = heroImageSwitcher(heroName);

            return (
                <div onClick={() => handleHeroClick(heroName, team)} key={heroName} style={{position: "relative"}}>
                    <Image className={heroStatus == 'banned' ? styles.banned : heroStatus == 'picked' ? styles.picked : heroStatus == 'hovered' ? styles.picked : styles.hero} src={heroImage} width='100' height='100' alt={heroName + 'portrait'}></Image>
                    <span style={{position: "absolute", margin: 0, padding: 0, color: 'red', right: "5px", top: "5px", fontSize: "24px;"}}>{voteBanCount == 0 ? null : voteBanCount}</span>
                </div>
            )
        }


        const roleChosen = (role: string): string => {
        
            const team = localTeam == gameState.Team1 ? team1 : team2;
            console.log('roleChosen', team)
            if(team.find(x => x.Role == role) != undefined){
                console.log('roleChosen', role , true)
                return team.find(x => x.Role == role)!.Username;
            }else{
                console.log('roleChosen', role, false)
                return "";
            }
        }


    //Showing the whole interface in a switch case depending on the current gamestate
    switch(gameState.Action) {
        case 'waiting':
            return (
                <main>
                    <div className={styles.sectionWrapper}>
                        <div className={styles.logoContainer}>
                            <Logo></Logo>        
                            
                            <div className={styles.title}>
                            {gameState.PlayerCount < gameState.PlayersNeeded ? <>Players Joined {gameState.PlayerCount} / {gameState.PlayersNeeded}</> : <>Waiting for players...</>}
                            </div>
                        </div>

                        <div className={styles.codeWrapper}>
                            <span className={styles.lobbyCode} style={{width: 'unset'}}>Lobby Code - {hideLobbyCode ? "xxxxxxxx": gameState.LobbyCode}</span>

                            <div className={styles.copyButtonWrapper}>
                                <button className={styles.copyButton} onClick={() => {handleCopyClick()}}>Copy Code
                                </button>

                                <button className={styles.copyButton} onClick={() => {setHideLobbyCode(!hideLobbyCode)}}>Hide/Show Code
                                </button>
                            </div>
                        </div>

                        {spectator ? null : <div className={styles.teamButtonWrapper}>
                            <button className={team1.length < 5 ? localTeam == gameState.Team1 || localTeam == "" ? styles.button : styles.otherTeamButton : styles.otherTeamButton} id="team1" onClick={() => handleTeamClick(gameState.Team1)} disabled={localTeam == gameState.Team2}>{gameState.Team1}</button>
                            <button className={team2.length < 5 ? localTeam == gameState.Team2 || localTeam == "" ? styles.button : styles.otherTeamButton : styles.otherTeamButton} id="team2" onClick={() => handleTeamClick(gameState.Team2)} disabled={localTeam == gameState.Team1}>{gameState.Team2}</button>
                        </div>}

                        {spectator || gameState.PlayersNeeded == 2 ? null : <div className={styles.lobbyRoles}>
                            {localTeam != '' ? roles.map((role) => {
                                // Cannot transfer image data over server, so it needs to be imported at build time and accessed via a variable. There's probably a better way to do this.
                                let roleImage;
                                switch(role.RoleName) {
                                    case 'Carry':
                                        roleImage = carryIcon;
                                        break;
                                    case 'Support':
                                        roleImage = supIcon;
                                        break;
                                    case 'Midlane':
                                        roleImage = midIcon;
                                        break;
                                    case 'Offlane':
                                        roleImage = offIcon;
                                        break;
                                    case 'Jungle':
                                        roleImage = jungleIcon;
                                        break;
                                    default:
                                        roleImage = logo;
                                }
                                return (
                                    <button className={styles.roleButton} onClick={() => handlePlayerRoleClick(role.RoleName)} key={role.RoleName} disabled={roleChosen(role.RoleName) != "" ? true : false}>
                                        <Image className={styles.roleImage} src={roleImage} width='50' height='50' alt={role.RoleName + ' icon'}/>
                                        <span  className={styles.name}>{roleChosen(role.RoleName) != "" ? roleChosen(role.RoleName) : null}</span>
                                    </button>
                                    
                                )
                            }) : <></>}
                        </div>}
                        
                    </div>
                </main>
            )
        case 'team1Banning':
            return(
                <div className={styles.lobby}>
                    <div className={styles.lobbyLeft}>
                        <span style={{textAlign: 'left', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team1 : gameState.Team2}</span>
    
                        {(gameState.Team1 == localTeam ? team1 : team2).map((player) => (
                            <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='left' key={player.SocketID}/>
                        ))}
    
                        <div className={styles.bannedList}>
                            {(gameState.Team1 == localTeam ? bannedHeroesTeam1 : bannedHeroesTeam2)?.map((hero) => {
                                const herox = heroes.find((x) => x.Name == hero)
                                return(
                                    <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                )
                            })}
                        </div>
                            
                    </div>
                        
                    <div className={styles.lobbyCenter}>

                        <div className={styles.lobbyTimer}>
                            <Countdown date={localDate + (gameState.Timer * 1000)} overtime={true} renderer={(props) => <span>{props.seconds}</span>}/>
    
                            <svg className={styles.deco} width="654" height="19" viewBox="0 0 654 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5.92798 14.6L1 9.50003L5.92798 4.40008M19.0691 16.3L23.997 9.50003M23.997 9.50003L19.0691 2.7001M23.997 9.50003L263.534 9.50005M263.534 9.50005L271.747 1.00014L284.888 14.6L289.816 9.50005L284.888 4.4001L271.747 18L263.534 9.50005ZM189.615 1.00014L265.176 1.00014L273.389 9.50005L265.176 18L94.3425 18M648.072 14.5999L653 9.49995L648.072 4.4M634.931 16.2999L630.003 9.49996M630.003 9.49996L634.931 2.70001M630.003 9.49996L390.467 9.49996M390.467 9.49996L385.539 4.40001M390.467 9.49996L385.539 14.5999M385.539 4.40001L382.254 1.00004L374.04 9.49996M385.539 4.40001L388.824 1.00004L464.385 1.00004M385.539 4.40001L380.611 9.49996L385.539 14.5999M374.04 9.49996L369.113 14.5999L364.185 9.49996L369.113 4.40001L374.04 9.49996ZM374.04 9.49996L382.254 17.9999L385.539 14.5999M385.539 14.5999L388.824 17.9999L559.658 17.9999M12.4985 14.6L7.57062 9.50003L12.4985 4.40008L17.4265 9.50003L12.4985 14.6ZM641.502 14.5999L646.429 9.49995L641.502 4.4L636.574 9.49995L641.502 14.5999Z" stroke="white" stroke-opacity="0.5" stroke-miterlimit="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span className={styles.lobbyAction}>{gameState.ActiveUser[0]!.Username} is Banning...</span>
                        <div className={styles.heroes}>
                            {heroes.map((hero) => (
                                <HeroSelect heroName={hero.Name} heroStatus={hero.Status} voteBanCount={hero.Votes} team={localTeam} key={hero.Name}/>
                            ))}
                        </div>
                    </div>
    
                    <div className={styles.lobbyRight}>
                        <span style={{textAlign: 'right', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team2 : gameState.Team1}</span>
    
                        {(gameState.Team1 == localTeam ? team2 : team1).map((player) => (
                            <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='right' key={player.SocketID}/>
                        ))}
    
                        <div className={styles.bannedList}>
                            {(gameState.Team1 == localTeam ? bannedHeroesTeam2 : bannedHeroesTeam1)?.map((hero) => {
                                const herox = heroes.find((x) => x.Name == hero)
                                return(
                                    <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                )
                            })}
                        </div>
    
                    </div>
                </div>
            )
        case 'team2Banning':
            return(
                <div className={styles.lobby}>
                    <div className={styles.lobbyLeft}>
                        <span style={{textAlign: 'left', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team1 : gameState.Team2}</span>

                        {(gameState.Team1 == localTeam ? team1 : team2).map((player) => (
                            <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='left' key={player.SocketID}/>
                        ))}

                        <div className={styles.bannedList}>
                            {(gameState.Team1 == localTeam ? bannedHeroesTeam1 : bannedHeroesTeam2)?.map((hero) => {
                                const herox = heroes.find((x) => x.Name == hero)
                                return(
                                    <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                )
                            })}
                        </div>

                    </div>
                    
                    <div className={styles.lobbyCenter}>
                        
                        <div className={styles.lobbyTimer}>
                            <Countdown date={localDate + (gameState.Timer * 1000)} overtime={true} renderer={(props) => <span>{props.seconds}</span>}/>

                            <svg className={styles.deco} width="654" height="19" viewBox="0 0 654 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5.92798 14.6L1 9.50003L5.92798 4.40008M19.0691 16.3L23.997 9.50003M23.997 9.50003L19.0691 2.7001M23.997 9.50003L263.534 9.50005M263.534 9.50005L271.747 1.00014L284.888 14.6L289.816 9.50005L284.888 4.4001L271.747 18L263.534 9.50005ZM189.615 1.00014L265.176 1.00014L273.389 9.50005L265.176 18L94.3425 18M648.072 14.5999L653 9.49995L648.072 4.4M634.931 16.2999L630.003 9.49996M630.003 9.49996L634.931 2.70001M630.003 9.49996L390.467 9.49996M390.467 9.49996L385.539 4.40001M390.467 9.49996L385.539 14.5999M385.539 4.40001L382.254 1.00004L374.04 9.49996M385.539 4.40001L388.824 1.00004L464.385 1.00004M385.539 4.40001L380.611 9.49996L385.539 14.5999M374.04 9.49996L369.113 14.5999L364.185 9.49996L369.113 4.40001L374.04 9.49996ZM374.04 9.49996L382.254 17.9999L385.539 14.5999M385.539 14.5999L388.824 17.9999L559.658 17.9999M12.4985 14.6L7.57062 9.50003L12.4985 4.40008L17.4265 9.50003L12.4985 14.6ZM641.502 14.5999L646.429 9.49995L641.502 4.4L636.574 9.49995L641.502 14.5999Z" stroke="white" stroke-opacity="0.5" stroke-miterlimit="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span className={styles.lobbyAction}>{gameState.ActiveUser[0]!.Username} is Banning...</span>
                        <div className={styles.heroes}>                              
                            {heroes.map((hero) => (
                                <HeroSelect heroName={hero.Name} heroStatus={hero.Status} voteBanCount={hero.Votes} team={localTeam} key={hero.Name}/>
                            ))}
                        </div>
                    </div>

                    <div className={styles.lobbyRight}>
                        <span style={{textAlign: 'right', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team2 : gameState.Team1}</span>
                        {(gameState.Team1 == localTeam ? team2 : team1).map((player) => (
                            <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='right' key={player.SocketID}/>
                        ))}

                        <div className={styles.bannedList}>
                            {(gameState.Team1 == localTeam ? bannedHeroesTeam2 : bannedHeroesTeam1)?.map((hero) => {
                                const herox = heroes.find((x) => x.Name == hero)
                                return(
                                    <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                )
                            })}
                        </div>

                    </div>
                </div>
            )
            case 'team1Picking': 
            return(
                <div className={styles.lobby}>
                    <div className={styles.lobbyLeft}>
                        <span style={{textAlign: 'left', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team1 : gameState.Team2}</span>

                        {(gameState.Team1 == localTeam ? team1 : team2).map((player) => (
                            <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='left' key={player.SocketID}/>
                        ))}
                        
                        <div className={styles.bannedList}>
                            {(gameState.Team1 == localTeam ? bannedHeroesTeam1 : bannedHeroesTeam2)?.map((hero) => {
                                const herox = heroes.find((x) => x.Name == hero)
                                return(
                                    <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                )
                            })}
                        </div>

                        {heroHover != '' ? <button style={{marginTop: 'auto'}} className={styles.button} onClick={() => handleHeroLockIn(heroHover, localTeam)}>Lock In</button> : null}
                    </div>
                    
                    <div className={styles.lobbyCenter}>                        
                        <div className={styles.lobbyTimer}>
                            <Countdown date={localDate + (gameState.Timer * 1000)} overtime={true} renderer={(props) => <span>{props.seconds}</span>}/>

                            <svg className={styles.deco} width="654" height="19" viewBox="0 0 654 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5.92798 14.6L1 9.50003L5.92798 4.40008M19.0691 16.3L23.997 9.50003M23.997 9.50003L19.0691 2.7001M23.997 9.50003L263.534 9.50005M263.534 9.50005L271.747 1.00014L284.888 14.6L289.816 9.50005L284.888 4.4001L271.747 18L263.534 9.50005ZM189.615 1.00014L265.176 1.00014L273.389 9.50005L265.176 18L94.3425 18M648.072 14.5999L653 9.49995L648.072 4.4M634.931 16.2999L630.003 9.49996M630.003 9.49996L634.931 2.70001M630.003 9.49996L390.467 9.49996M390.467 9.49996L385.539 4.40001M390.467 9.49996L385.539 14.5999M385.539 4.40001L382.254 1.00004L374.04 9.49996M385.539 4.40001L388.824 1.00004L464.385 1.00004M385.539 4.40001L380.611 9.49996L385.539 14.5999M374.04 9.49996L369.113 14.5999L364.185 9.49996L369.113 4.40001L374.04 9.49996ZM374.04 9.49996L382.254 17.9999L385.539 14.5999M385.539 14.5999L388.824 17.9999L559.658 17.9999M12.4985 14.6L7.57062 9.50003L12.4985 4.40008L17.4265 9.50003L12.4985 14.6ZM641.502 14.5999L646.429 9.49995L641.502 4.4L636.574 9.49995L641.502 14.5999Z" stroke="white" stroke-opacity="0.5" stroke-miterlimit="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        {gameState.PlayersNeeded == 10 ? <span className={styles.lobbyAction}>{gameState.ActiveUser[0]!.Username}{gameState.ActiveUser[1] ? ` & ${gameState.ActiveUser[1]!.Username}` : null} is Picking...</span> : <span className={styles.lobbyAction}>{gameState.Team1} is Picking...</span>}
                        <div className={styles.heroes}>  
                            {heroes.map((hero) => (
                                <HeroSelect heroName={hero.Name} heroStatus={hero.Status} voteBanCount={hero.Votes} team={localTeam} key={hero.Name}/>
                            ))}
                        </div>
                    </div>

                    <div className={styles.lobbyRight}>
                        <span style={{textAlign: 'right', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team2 : gameState.Team1}</span>

                        {(gameState.Team1 == localTeam ? team2 : team1).map((player) => (
                            <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='right' key={player.SocketID}/>
                        ))}

                        <div className={styles.bannedList}>
                            {(gameState.Team1 == localTeam ? bannedHeroesTeam2 : bannedHeroesTeam1)?.map((hero) => {
                                const herox = heroes.find((x) => x.Name == hero)
                                return(
                                    <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                )
                            })}
                        </div>

                    </div>
                </div>
            )
            case 'team2Picking':
                return(
                    <div className={styles.lobby}>
                        <div className={styles.lobbyLeft}>
                            <span style={{textAlign: 'left', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team1 : gameState.Team2}</span>
    
                            {(gameState.Team1 == localTeam ? team1 : team2).map((player) => (
                                <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='left' key={player.SocketID}/>
                            ))}
    
                            <div className={styles.bannedList}>
                                {(gameState.Team1 == localTeam ? bannedHeroesTeam1 : bannedHeroesTeam2)?.map((hero) => {
                                    const herox = heroes.find((x) => x.Name == hero)
                                    return(
                                        <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                    )
                                })}
                            </div>
    
    
                            {heroHover != '' ? <button style={{marginTop: 'auto'}} className={styles.button} onClick={() => handleHeroLockIn(heroHover, localTeam)}>Lock In</button> : null}
                        </div>
                        
                        <div className={styles.lobbyCenter}>
                            <div className={styles.lobbyTimer}>
                                <Countdown date={localDate + (gameState.Timer * 1000)} overtime={true} renderer={(props) => <span>{props.seconds}</span>}/>
    
                                <svg className={styles.deco} width="654" height="19" viewBox="0 0 654 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M5.92798 14.6L1 9.50003L5.92798 4.40008M19.0691 16.3L23.997 9.50003M23.997 9.50003L19.0691 2.7001M23.997 9.50003L263.534 9.50005M263.534 9.50005L271.747 1.00014L284.888 14.6L289.816 9.50005L284.888 4.4001L271.747 18L263.534 9.50005ZM189.615 1.00014L265.176 1.00014L273.389 9.50005L265.176 18L94.3425 18M648.072 14.5999L653 9.49995L648.072 4.4M634.931 16.2999L630.003 9.49996M630.003 9.49996L634.931 2.70001M630.003 9.49996L390.467 9.49996M390.467 9.49996L385.539 4.40001M390.467 9.49996L385.539 14.5999M385.539 4.40001L382.254 1.00004L374.04 9.49996M385.539 4.40001L388.824 1.00004L464.385 1.00004M385.539 4.40001L380.611 9.49996L385.539 14.5999M374.04 9.49996L369.113 14.5999L364.185 9.49996L369.113 4.40001L374.04 9.49996ZM374.04 9.49996L382.254 17.9999L385.539 14.5999M385.539 14.5999L388.824 17.9999L559.658 17.9999M12.4985 14.6L7.57062 9.50003L12.4985 4.40008L17.4265 9.50003L12.4985 14.6ZM641.502 14.5999L646.429 9.49995L641.502 4.4L636.574 9.49995L641.502 14.5999Z" stroke="white" stroke-opacity="0.5" stroke-miterlimit="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </div>
                            {gameState.PlayersNeeded == 10 ? <span className={styles.lobbyAction}>{gameState.ActiveUser[0]!.Username}{gameState.ActiveUser[1] ? ` & ${gameState.ActiveUser[1]!.Username}` : null} is Picking...</span> : <span className={styles.lobbyAction}>{gameState.Team2} is Picking...</span>}
                            <div className={styles.heroes}>  
                                {heroes.map((hero) => (
                                    <HeroSelect heroName={hero.Name} heroStatus={hero.Status} voteBanCount={hero.Votes} team={localTeam} key={hero.Name}/>
                                ))}
                            </div>
                        </div>
    
                        <div className={styles.lobbyRight}>
                            <span style={{textAlign: 'right', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team2 : gameState.Team1}</span>
    
                            {(gameState.Team1 == localTeam ? team2 : team1).map((player) => (
                                <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='right' key={player.SocketID}/>
                            ))}
    
                            <div className={styles.bannedList}>
                                {(gameState.Team1 == localTeam ? bannedHeroesTeam2 : bannedHeroesTeam1)?.map((hero) => {
                                    const herox = heroes.find((x) => x.Name == hero)
                                    return(
                                        <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                    )
                                })}
                            </div>
    
                        </div>
                    </div>
                )
                case 'finished':
                    socket?.disconnect();
                    return(
                        <main>
                            <div className={styles.lobby} style={{alignItems: 'center'}}>
                                <div className={styles.lobbyLeft}>
                                    <span style={{textAlign: 'left', height: '20px'}} className='title'>{gameState.Team1 == localTeam ? gameState.Team1 : gameState.Team2}</span>
        
                                    {(gameState.Team1 == localTeam ? team1 : team2).map((player) => (
                                        <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='left' key={player.SocketID}/>
                                    ))}
        
                                    <div className={styles.bannedList}>
                                        {(gameState.Team1 == localTeam ? bannedHeroesTeam1 : bannedHeroesTeam2)?.map((hero) => {
                                            const herox = heroes.find((x) => x.Name == hero)
                                            return(
                                                <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                            )
                                        })}
                                    </div>
        
                                </div>
                                <div className={styles.sectionWrapper}>
                                    <div className='logo'>
                                        <Image src={logo} width='144' height='150' alt='Predtools Logo'></Image>
                                    </div>
                                    <div className={styles.teamButtonWrapper} style={{justifyContent: 'center'}}>
                                        <Link href="/"><button className={styles.button}>Leave</button></Link>
                                    </div>
                                </div>
                                <div className={styles.lobbyRight}>
                                    <span style={{textAlign: 'right', height: '20px'}} className={styles.title}>{gameState.Team1 == localTeam ? gameState.Team2 : gameState.Team1}</span>
        
                                    {(gameState.Team1 == localTeam ? team2 : team1).map((player) => (
                                        <LobbyUser username={player.Username} status={player.Status} hero={player.Hero} role={player.Role} pos='right' key={player.SocketID}/>
                                    ))}
        
                                    <div className={styles.bannedList}>
                                        {(gameState.Team1 == localTeam ? bannedHeroesTeam2 : bannedHeroesTeam1)?.map((hero) => {
                                            const herox = heroes.find((x) => x.Name == hero)
                                            return(
                                                <Image className={styles.banned} src={heroImageSwitcher(herox!.Name)} width='100' height='100' key={herox!.Name} alt={`${herox!.Name} portrait`}></Image>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </main>
                    )
                    break;
    }
}