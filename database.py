import bcrypt
from pymongo import MongoClient
from pymodm import connect, MongoModel, fields
from bson import ObjectId
from dotenv import load_dotenv
import os
from typing import List,Dict

# Load environment variables
load_dotenv()

# MongoDB connection URI from environment variables
MONGO_URI = os.getenv('MONGO_URI')
# print(MONGO_URI)

# Connect to MongoDB using pymodm
connect(MONGO_URI)

class User(MongoModel):
    """
    User model for MongoDB using pymodm.
    Fields:
        user_name: Username of the user.
        password: Hashed password of the user.
        first_name: First name of the user.
        email: Email address of the user.
    """
    user_name = fields.CharField(mongo_name="User Name")
    password = fields.CharField(mongo_name="Password")
    first_name = fields.CharField(mongo_name="First Name")
    email = fields.EmailField(mongo_name="Email")

class ChatHistory(MongoModel):
    """
    Chat history model for MongoDB using pymodm.
    Fields:
        secret_key: A string representing the secret key for the chat room.
        history: List of dictionaries representing the chat history.
    """
    secret_key = fields.CharField()
    history = fields.ListField()

class Game(MongoModel):
    """
     Game model for MongoDB using pymodm.
    Fields:
        creator_id: Creator Id is the Id of the player that created a game.
        
    """
    creator_id = fields.ReferenceField('User')
    

class GamePlay(MongoModel):
    """
    Game Play model for MongoDB using pymodm.
    Fields:
        game_id: Game Id is the Id of a game that was created.
        player_that_joined_id: Player Id of the player who joined the game.
        guesses: Guesses of both players in a list.
    """
    game_id = fields.ReferenceField('Game')
    player_that_joined_id = fields.ReferenceField('User')
    guesses = fields.ListField()
    creator_choice= fields.CharField()
    joiner_choice=fields.CharField()
class PowerUp(MongoModel):
    """
    PowerUp model for MongoDB using pymodm.
    Fields:
        game_play_id: Reference to the GamePlay instance.
        player_id: Reference to the player who has the power-up.
        number: The number of power-ups, defaulting to 5.
    """
    game_play_id = fields.ReferenceField('GamePlay')
    player_id = fields.ReferenceField('User')
    number = fields.IntegerField()

class TurnCount(MongoModel):
    """
    Model to represent turn count for a game.

    Fields:
    turn_count (int): The current turn count in the game.
    game_id (ObjectId): The ID of the game.
    """
    turn_count = fields.IntegerField()
    game_id = fields.ReferenceField('Game')


def signup(user: str, passw: str, first_name: str, email: str) -> User:
    """
    Sign up a new user and save to the database.

    Args:
        user: Username of the new user.
        passw: Plaintext password of the new user.
        first_name: First name of the new user.
        email: Email address of the new user.

    Returns:
        The created User object.
    """
    # Hash the password
    hashed_passw = bcrypt.hashpw(passw.encode('utf-8'), bcrypt.gensalt())
    # Create a new User object
    new_user = User(user_name=user, password=hashed_passw, first_name=first_name, email=email)
    # Save the new user to the database
    new_user.save()
    return new_user

def login(user: str, passw: str) -> User:
    """
    Log in an existing user by verifying the username and password.

    Args:
        user: Username of the user.
        passw: Plaintext password of the user.

    Returns:
        The User object if login is successful, None otherwise.
    """
    # Retrieve all users from the database
    users = User.objects.all()
    # Iterate through all users
    for u in users:
        if user == u.user_name:
            # Check the hashed password
            checkP = u.password[2:-1]  # Remove b'' from the stored hashed password
            checkP = bytes(checkP, 'utf-8')
            if bcrypt.checkpw(passw.encode('utf-8'), checkP):
                print('Login successful')
                return u
    return None

def save_chat_history(secret_key: str, new_chat: List) -> ChatHistory:
    """
    Save chat history for a given secret key. If the secret key exists, update the chat history.
    Otherwise, create a new chat history document.

    Args:
        secret_key: The secret key for the chat room.
        new_chat: A dictionary representing the new chat message to be added.

    Returns:
        The updated or created ChatHistory object.
    """
    try:
        # Check if a chat history with the given secret key exists
        chat_history = ChatHistory.objects.get({"secret_key": secret_key})
        # Append the new chat to the existing chat history
        
        chat_history.history=new_chat
        chat_history.save()
        print(f"Chat history updated for secret key: {secret_key}")
    except ChatHistory.DoesNotExist:
        # If the chat history does not exist, create a new one
        chat_history = ChatHistory(secret_key=secret_key, history=[new_chat])
        chat_history.save()
        print(f"New chat history created for secret key: {secret_key}")

    return chat_history



def test_database_functions():
    """
    Test the database functions: signup, login, and saving chat history.
    """
    # Test data
    username = "testuser"
    password = "testpassword"
    first_name = "Test"
    email = "testuser@example.com"
    secret_key = "secret123"
    

    # Sign up a new user
    print("Signing up a new user...")
    try:
        new_user = signup(username, password, first_name, email)
        print(f"User {new_user.user_name} signed up successfully.")
    except Exception as e:
        print(f"Error signing up user: {e}")
        return

    # Attempt to log in with the new user
    print("Attempting to log in with the new user...")
    try:
        logged_in_user = login(username, password)
        test_list = [
        {"user": f"{logged_in_user._id}", "role": "user", "content": "Hey"},
        {"user": f"{logged_in_user._id}", "role": "assistant", "content": "whatsup"}
    ]
        if logged_in_user:
            print(f"Login successful for user: {logged_in_user.user_name}")
        else:
            print("Login failed: Incorrect username or password.")
            return
    except Exception as e:
        print(f"Error logging in user: {e}")
        return

    # Save chat history for the logged-in user
    print("Saving chat history for the logged-in user...")
    try:
        for chat in test_list:
            save_chat_history(secret_key, chat)
        print(f"Chat history saved successfully for secret key: {secret_key}")
    except Exception as e:
        print(f"Error saving chat history: {e}")

    # # Delete the user and associated chat history
    # print("Deleting the user and associated chat history...")
    # try:
    #     logged_in_user.delete()
    #     print("User and associated chat history deleted successfully.")
    # except Exception as e:
    #     print(f"Error deleting user: {e}")





def is_username_still_valid(username: str) -> bool:
    """
    Check if the username is still valid (i.e., does not exist in the database).

    Args:
        username: The username to check.

    Returns:
        True if the username does not exist in the database, False otherwise.
    """

    try:
        # Check if a user with the given username exists
        users = User.objects.all()
        users=list(users)
        for user in users:
            if user.user_name == username:
                return False
            
        return True
        
            
    except User.DoesNotExist:
        print(f"Username '{username}' is available.")
        return True

def test_is_username_still_valid():
    """
    Test the is_username_still_valid function.
    """
    test_usernames = ["testuser", "newuser"]

    for username in test_usernames:
        if is_username_still_valid(username):
            print(f"The username '{username}' is available.")
        else:
            print(f"The username '{username}' is already taken.")

# test_is_username_still_valid()



# Run the test

# test_database_functions()






# Check if a user with the given username exists

from typing import Optional

def get_chat_history_by_secret_key(secret_key: str) -> Optional[list]:
    """
    Retrieve the chat history for a given secret key.

    Args:
        secret_key: The secret key associated with the chat history.

    Returns:
        The chat history associated with the secret key, or None if no chat history exists for the secret key.
    """
    try:
        chat_history = ChatHistory.objects.get({"secret_key": secret_key})
        return chat_history.history
    except ChatHistory.DoesNotExist:
        return []
    









def create_game(creator_id: str) -> Game:
    """
    Create a new game and save it to the database.

    Args:
        creator_id: The ID of the user who is creating the game.

    Returns:
        The created Game object.
    """
    try:
        game = Game(creator_id=creator_id)
        game.save()
        return game
    except Exception as e:
        print(f"Error creating game: {e}")
        return None

def create_gameplay(game_id: str, player_that_joined_id: str,guess: List) -> GamePlay:
    """
    Create a new gameplay session and save it to the database.

    Args:
        game_id: The ID of the game.
        player_that_joined_id: The ID of the player joining the game.

    Returns:
        The created GamePlay object.
    """
    try:
        gameplay = GamePlay(game_id=game_id, player_that_joined_id=player_that_joined_id, guesses=guess)
        gameplay.save()
        return gameplay
    except Exception as e:
        print(f"Error creating gameplay: {e}")
        return None

def create_powerup(game_play_id: str, player_id: str, number: int ) -> PowerUp:
    """
    Create a new power-up and save it to the database.

    Args:
        game_play_id: The ID of the gameplay session.
        player_id: The ID of the player who owns the power-up.
        number: The number of power-ups, defaulting to 5.

    Returns:
        The created PowerUp object.
    """
    try:
        powerup = PowerUp(game_play_id=game_play_id, player_id=player_id, number=number)
        powerup.save()
        return powerup
    except Exception as e:
        print(f"Error creating power-up: {e}")
        return None



# Example usage
# user = signup("username", "password", "First", "email@example.com")
# logged_in_user = login("username", "password")
# if logged_in_user:
#     new_game = create_game(logged_in_user._id)
#     new_gameplay = create_gameplay(new_game._id, logged_in_user._id,[0,1,2,3])
#     new_powerup = create_powerup(new_gameplay._id, logged_in_user._id)


def check_player_created_game(player_id: ObjectId, game_id: ObjectId) -> bool:
    """Checks if the player is the creator of the game."""
    with MongoClient(MONGO_URI) as client:
        game_id=ObjectId(game_id)
        db = client['dead_and_injured']
        games_collection = db['game']
        game = games_collection.find_one({"_id": game_id})
        if game['creator_id'] == ObjectId(player_id): 
            return True
    
    return False


def check_game_already_joined(game_id: ObjectId) -> bool:
    """Checks if the game has already been joined."""
    with MongoClient(MONGO_URI) as client:
        db = client['dead_and_injured']
        gameplay_collection = db['game_play']
        game_played = gameplay_collection.find_one({"game_id": game_id})
        if game_played:
            return True
    
    return False

# Example usage
# player_id = "668d16955cf6961be664ca66"
game_id = ObjectId("668d71345cf6961be664caee")

# if not check_player_created_game(player_id, game_id) and not check_game_already_joined(game_id):
#     print("Player can join the game.")
# else:
#     print("Player cannot join the game.")



def check_if_player_has_joined(game_id:ObjectId):
    try:
        game_id= ObjectId(game_id)
        gameplay = GamePlay.objects.get({"game_id": game_id})
        return gameplay
    except GamePlay.DoesNotExist:
        return None
    



def add_choices_to_existing_gameplayc(gameplay_id: ObjectId, creator_choice: str):
    try:
        # Use pymongo for direct MongoDB operations
        with MongoClient(MONGO_URI) as client:
            db = client.get_database()  # Automatically uses the database from the URI
            gameplay_collection = db['game_play']  # Ensure this matches your collection name

            # Update the document with new fields
            
            
            result = gameplay_collection.update_one(
                {'_id': gameplay_id._id},
                {'$set': {'creator_choice': creator_choice}}
            )
            
            if result.modified_count == 1:
                print("Choices added successfully to gameplay document.")
            else:
                print("Failed to update gameplay document or no changes made.")
    except Exception as e:
        
        print(f"An error occurred: {e}")

def add_choices_to_existing_gameplayj(gameplay_id: ObjectId, joiner_choice: str):
    try:
        # Use pymongo for direct MongoDB operations
        with MongoClient(MONGO_URI) as client:
            db = client.get_database()  # Automatically uses the database from the URI
            gameplay_collection = db['game_play']  # Ensure this matches your collection name
            
            # Update the document with new fields
            result = gameplay_collection.update_one(
                {'_id': gameplay_id._id},
                {'$set': {'joiner_choice': joiner_choice}}
            )
            
            if result.modified_count == 1:
                print("Choices added successfully to gameplay document.")
            else:
                print("Failed to update gameplay document or no changes made.")
    except Exception as e:
        print(f"An error occurred: {e}")




# Ensure this matches your collection name

def check_creator_choice_exists(gameplay_id:ObjectId):
    """
    Checks if the 'creator_choice' field exists in any document in the gameplay collection.
    """
    client = MongoClient(MONGO_URI)
    db = client.get_database()  # Automatically uses the database from the URI
    gameplay_collection = db['game_play']  
    query = {'_id': ObjectId(gameplay_id),'creator_choice': {'$exists': True}}
    result = gameplay_collection.find_one(query)
    
    if result:
        print("The 'creator_choice' field exists in the gameplay collection.")
        return True
    else:
        print("The 'creator_choice' field does not exist in the gameplay collection.")
        return False





def save_turn_count(game_id: ObjectId, new_turn_count: int) -> TurnCount:
    """
    Save or update the turn count for a given game ID. If the game ID exists, update the turn count.
    Otherwise, create a new TurnCount object.

    Args:
        game_id (ObjectId): The ID of the game.
        new_turn_count (int): The new turn count to set.

    Returns:
        The updated or created TurnCount object.
    """
    try:
        game_id= ObjectId(game_id)
        # Check if a TurnCount with the given game ID exists
        turn_count = TurnCount.objects.get({"game_id": game_id})
        # Update the existing turn count
        turn_count.turn_count = new_turn_count
        turn_count.save()
        print(f"Turn count updated for game ID: {game_id}")
    except TurnCount.DoesNotExist:
        # If the TurnCount does not exist, create a new one
        turn_count = TurnCount(game_id=game_id, turn_count=new_turn_count)
        turn_count.save()
        print(f"New TurnCount created for game ID: {game_id}")

    return turn_count


def get_turn_count(game_id: ObjectId) -> int:
    """
    Retrieve the turn count value for a given game ID.

    Args:
        game_id (ObjectId): The ID of the game.

    Returns:
        int: The turn count value.

    Raises:
        ValueError: If no TurnCount object is found with the given game ID.
    """
    try:
        # Check if a TurnCount with the given game ID exists
        turn_count = TurnCount.objects.get({"game_id": game_id})
        # Return the turn count value
        return turn_count.turn_count
    except TurnCount.DoesNotExist:
        raise ValueError(f"No TurnCount object found with the given game ID: {game_id}")


def update_game_play(game_id: ObjectId, guess: List) -> ChatHistory:
    """
    Update game play for a specific game id.

    Args:
        game_id: The game_id for the game play room.
        guess: A List representing the new guesses and old guesses both players make message to be added.

    Returns:
        The updated or created Game_play object.
    """
    
    # Check if a chat history with the given secret key exists
    game_play = GamePlay.objects.get({"game_id": game_id})
    # Append the new chat to the existing chat history
    
    game_play.guesses=guess
    game_play.save()
    print(f"Chat history updated for secret key: {game_id}")

def get_game_play_guesses(game_id: ObjectId) -> Optional[list]:
    """
    Retrieve the game play guesses for specific game id.

    Args:
        game_id: The game_id associated with the GamePlay OBject.

   
    """
    try:
        chat_history = GamePlay.objects.get({"game_id": game_id})
        return chat_history.guesses
    except ChatHistory.DoesNotExist:
        return []
    